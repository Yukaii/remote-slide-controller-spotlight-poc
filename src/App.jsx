import { useEffect, useState, useCallback } from 'react';
import { connectWebSocket, sendMessage } from './websocket';

const App = () => {
  const [mode, setMode] = useState('presentation');
  const [pointerPosition, setPointerPosition] = useState({ x: 0, y: 0 });
  const [showPointer, setShowPointer] = useState(false);

  const handleDeviceMotion = useCallback((event) => {
    if (mode === 'controller') {
      const { accelerationIncludingGravity } = event;
      const sensitivity = 2; // Reduced sensitivity for smoother movement

      setPointerPosition((prev) => {
        const newX = Math.min(Math.max(prev.x + accelerationIncludingGravity.x * sensitivity, 0), window.innerWidth);
        const newY = Math.min(Math.max(prev.y - accelerationIncludingGravity.y * sensitivity, 0), window.innerHeight);

        sendMessage({ x: newX, y: newY });
        return { x: newX, y: newY };
      });
    }
  }, [mode]);

  useEffect(() => {
    connectWebSocket((data) => {
      if (mode === 'presentation') {
        if (data.action === 'showPointer') {
          setShowPointer(true);
        } else if (data.action === 'hidePointer') {
          setShowPointer(false);
        } else if (data.x !== undefined && data.y !== undefined) {
          setPointerPosition(data);
        }
      }
    });

    if (mode === 'controller') {
      window.addEventListener('devicemotion', handleDeviceMotion);
    } else {
      window.removeEventListener('devicemotion', handleDeviceMotion);
    }

    return () => {
      window.removeEventListener('devicemotion', handleDeviceMotion);
    };
  }, [mode, handleDeviceMotion]);

  const handleModeToggle = () => {
    setMode(mode === 'presentation' ? 'controller' : 'presentation');
  };

  const handlePointerToggle = (show) => {
    sendMessage({ action: show ? 'showPointer' : 'hidePointer' });
  };

  return (
    <div className="h-screen w-screen relative">
      <button
        className="absolute top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded z-10"
        onClick={handleModeToggle}
      >
        Switch to {mode === 'presentation' ? 'Controller' : 'Presentation'} Mode
      </button>

      {mode === 'presentation' && (
        <div className="h-full w-full bg-black flex items-center justify-center text-white text-4xl">
          Presentation Mode
        </div>
      )}

      {mode === 'controller' && (
        <div className="h-full w-full bg-gray-200 flex items-center justify-center">
          <button
            className="bg-red-500 text-white px-8 py-4 rounded-full text-2xl"
            onTouchStart={() => handlePointerToggle(true)}
            onTouchEnd={() => handlePointerToggle(false)}
            onMouseDown={() => handlePointerToggle(true)}
            onMouseUp={() => handlePointerToggle(false)}
          >
            Hold to Show Pointer
          </button>
        </div>
      )}

      {/* Spotlight pointer */}
      {mode === 'presentation' && showPointer && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${pointerPosition.x}px`,
            top: `${pointerPosition.y}px`,
            width: '100px',
            height: '100px',
            background: 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%)',
            transform: 'translate(-50%, -50%)',
            transition: 'left 0.1s, top 0.1s', // Smooth transition for pointer movement
          }}
        />
      )}
    </div>
  );
};

export default App;
