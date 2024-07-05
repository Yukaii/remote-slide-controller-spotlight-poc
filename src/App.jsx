import { useEffect, useState, useCallback, useRef } from 'react';
import { connectWebSocket, sendMessage } from './websocket';

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
  const lastSendTime = useRef(0);
  const animationRef = useRef(null);
  const targetPosition = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  const handleDeviceMotion = useCallback((event) => {
    const now = Date.now();
    if (now - lastUpdateTime.current < 32) return; // Limit updates to ~30fps
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
      const newX = Math.min(Math.max(targetPosition.current.x + accelerationIncludingGravity.x * sensitivity, 0), window.innerWidth);
      const newY = Math.min(Math.max(targetPosition.current.y - accelerationIncludingGravity.y * sensitivity, 0), window.innerHeight);
      targetPosition.current = { x: newX, y: newY };

      if (showPointerRef.current && now - lastSendTime.current > 100) { // Send every 100ms
        sendMessage({ x: newX, y: newY, motionData: newMotionData, showPointer: showPointerRef.current });
        lastSendTime.current = now;
      }
    }
  }, [mode]);

  const animatePointer = useCallback(() => {
    setPointerPosition(current => {
      const dx = (targetPosition.current.x - current.x) * 0.1;
      const dy = (targetPosition.current.y - current.y) * 0.1;
      return {
        x: current.x + dx,
        y: current.y + dy
      };
    });
    animationRef.current = requestAnimationFrame(animatePointer);
  }, []);

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
          targetPosition.current = { x: data.x, y: data.y };
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

    animationRef.current = requestAnimationFrame(animatePointer);

    return () => {
      window.removeEventListener('devicemotion', handleDeviceMotion);
      cancelAnimationFrame(animationRef.current);
    };
  }, [mode, handleDeviceMotion, animatePointer]);

  const handleModeToggle = () => {
    setMode(prevMode => prevMode === 'presentation' ? 'controller' : 'presentation');
  };

  const handlePointerToggle = () => {
    setShowPointer(prev => {
      const newState = !prev;
      sendMessage({ showPointer: newState });
      return newState;
    });
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
            className={`bg-red-500 text-white px-8 py-4 rounded-full text-2xl mb-4 select-none ${showPointer ? 'opacity-50' : ''}`}
            onClick={handlePointerToggle}
          >
            {showPointer ? 'Hide Pointer' : 'Show Pointer'}
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
          }}
        />
      )}
    </div>
  );
};

export default App;
