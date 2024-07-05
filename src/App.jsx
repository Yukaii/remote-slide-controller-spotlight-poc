import { useEffect, useState, useCallback, useRef } from 'react';
import { connectWebSocket, sendMessage } from './websocket';

// Custom hook to create a state with a ref
const useStateRef = (initialValue) => {
  const [state, setState] = useState(initialValue);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  return [state, setState, stateRef];
};

const App = () => {
  const [mode, setMode] = useState('presentation');
  const [pointerPosition, setPointerPosition] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [showPointer, setShowPointer, showPointerRef] = useStateRef(false);
  const [motionData, setMotionData] = useState({ x: 'N/A', y: 'N/A', z: 'N/A' });
  const [permissionState, setPermissionState] = useState('unknown');
  const lastUpdateTime = useRef(0);

  const handleDeviceMotion = useCallback((event) => {
    const now = Date.now();
    if (now - lastUpdateTime.current < 16) return; // Limit updates to ~60fps
    lastUpdateTime.current = now;

    const { accelerationIncludingGravity } = event;
    const newMotionData = {
      x: accelerationIncludingGravity ? accelerationIncludingGravity.x.toFixed(2) : 'N/A',
      y: accelerationIncludingGravity ? accelerationIncludingGravity.y.toFixed(2) : 'N/A',
      z: accelerationIncludingGravity ? accelerationIncludingGravity.z.toFixed(2) : 'N/A'
    };
    setMotionData(newMotionData);

    if (mode === 'controller' && accelerationIncludingGravity) {
      const sensitivity = 2;
      setPointerPosition((prev) => {
        const newX = Math.min(Math.max(prev.x + accelerationIncludingGravity.x * sensitivity, 0), window.innerWidth);
        const newY = Math.min(Math.max(prev.y - accelerationIncludingGravity.y * sensitivity, 0), window.innerHeight);

        // Send both the updated position and motion data to the server
        sendMessage({ x: newX, y: newY, motionData: newMotionData, showPointer: showPointerRef.current });
        return { x: newX, y: newY };
      });
    }
  }, [mode]);

  const requestMotionPermission = () => {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission()
        .then(response => {
          setPermissionState(response);
          if (response === 'granted') {
            window.addEventListener('devicemotion', handleDeviceMotion);
          }
        })
        .catch(console.error);
    } else {
      setPermissionState('not required');
      window.addEventListener('devicemotion', handleDeviceMotion);
    }
  };

  useEffect(() => {
    const handleWebSocketMessage = (data) => {
      if (mode === 'presentation') {
        if (data.showPointer !== undefined) {
          setShowPointer(data.showPointer);
        }
        if (data.x !== undefined && data.y !== undefined) {
          setPointerPosition({ x: data.x, y: data.y });
        }
        if (data.motionData) {
          setMotionData(data.motionData);
        }
      }
    };

    connectWebSocket(handleWebSocketMessage);

    if (mode === 'controller') {
      if (typeof DeviceMotionEvent.requestPermission !== 'function') {
        setPermissionState('not required');
        window.addEventListener('devicemotion', handleDeviceMotion);
      }
    } else {
      window.removeEventListener('devicemotion', handleDeviceMotion);
    }

    return () => {
      window.removeEventListener('devicemotion', handleDeviceMotion);
    };
  }, [mode, handleDeviceMotion]);

  const handleModeToggle = () => {
    setMode(prevMode => prevMode === 'presentation' ? 'controller' : 'presentation');
  };

  const handlePointerToggle = (show) => {
    setShowPointer(show);
    sendMessage({ showPointer: show });
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
        <div className="h-full w-full bg-gray-200 flex flex-col items-center justify-center">
          <button
            className="bg-red-500 text-white px-8 py-4 rounded-full text-2xl mb-4 select-none"
            onTouchStart={() => handlePointerToggle(true)}
            onTouchEnd={() => handlePointerToggle(false)}
            onMouseDown={() => handlePointerToggle(true)}
            onMouseUp={() => handlePointerToggle(false)}
          >
            Hold to Show Pointer
          </button>
          {typeof DeviceMotionEvent.requestPermission === 'function' && permissionState !== 'granted' && (
            <button
              className="bg-blue-500 text-white px-4 py-2 rounded mt-4"
              onClick={requestMotionPermission}
            >
              Request Motion Permission
            </button>
          )}
          <div className="text-black text-xl mt-4">
            <p>Acceleration X: {motionData.x}</p>
            <p>Acceleration Y: {motionData.y}</p>
            <p>Acceleration Z: {motionData.z}</p>
            <p>Pointer X: {pointerPosition.x.toFixed(2)}</p>
            <p>Pointer Y: {pointerPosition.y.toFixed(2)}</p>
            <p>DeviceMotion Supported: {window.DeviceMotionEvent ? 'Yes' : 'No'}</p>
            <p>Permission State: {permissionState}</p>
            <p>Show Pointer: {showPointer ? 'Yes' : 'No'}</p>
          </div>
        </div>
      )}

      {/* Spotlight pointer */}
      {showPointer && mode === 'presentation' && (
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
