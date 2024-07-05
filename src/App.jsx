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
  const [orientationData, setOrientationData] = useState({ alpha: 'N/A', beta: 'N/A', gamma: 'N/A' });
  const [permissionState, setPermissionState] = useState('unknown');
  const [calibrationData, setCalibrationData, calibrationDataRef] = useStateRef(null);
  const lastUpdateTime = useRef(0);
  const lastSendTime = useRef(0);
  const animationRef = useRef(null);
  const targetPosition = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  const handleDeviceOrientation = useCallback((event) => {
    const now = Date.now();
    if (now - lastUpdateTime.current < 32) return;
    lastUpdateTime.current = now;

    const newOrientationData = {
      alpha: event.alpha ? event.alpha.toFixed(2) : 'N/A',
      beta: event.beta ? event.beta.toFixed(2) : 'N/A',
      gamma: event.gamma ? event.gamma.toFixed(2) : 'N/A'
    };
    setOrientationData(newOrientationData);

    if (mode === 'controller' && calibrationDataRef.current) {
      const sensitivityX = 2; // Lowered sensitivity
      const sensitivityY = 2; // Lowered sensitivity

      const calibratedBeta = event.beta - calibrationDataRef.current.beta;
      const calibratedGamma = event.gamma - calibrationDataRef.current.gamma;

      const deltaX = calibratedGamma * sensitivityX;
      const deltaY = calibratedBeta * sensitivityY; // Removed negation to flip back

      const newX = Math.max(0, Math.min(window.innerWidth, targetPosition.current.x + deltaX));
      const newY = Math.max(0, Math.min(window.innerHeight, targetPosition.current.y + deltaY));

      targetPosition.current = { x: newX, y: newY };

      // Update pointer position immediately to reduce lag
      setPointerPosition({ x: newX, y: newY });

      if (showPointerRef.current && now - lastSendTime.current > 100) { // Send every 100ms
        sendMessage({ x: newX, y: newY, orientationData: newOrientationData, showPointer: showPointerRef.current });
        lastSendTime.current = now;
      }
    }
  }, [mode, calibrationDataRef, showPointerRef]);

  const animatePointer = useCallback(() => {
    setPointerPosition(current => {
      const dx = (targetPosition.current.x - current.x) * 0.2; // Lowered from 0.5 to 0.2
      const dy = (targetPosition.current.y - current.y) * 0.2; // Lowered from 0.5 to 0.2
      return {
        x: Math.max(0, Math.min(window.innerWidth, current.x + dx)),
        y: Math.max(0, Math.min(window.innerHeight, current.y + dy))
      };
    });
    animationRef.current = requestAnimationFrame(animatePointer);
  }, []);
  const requestOrientationPermission = () => {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(response => {
          setPermissionState(response);
          if (response === 'granted') {
            window.addEventListener('deviceorientation', handleDeviceOrientation);
          }
        })
        .catch(console.error);
    } else {
      setPermissionState('not required');
      window.addEventListener('deviceorientation', handleDeviceOrientation);
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
        if (data.orientationData) {
          setOrientationData(data.orientationData);
        }
      }
    };

    connectWebSocket(handleWebSocketMessage);

    if (mode === 'controller') {
      if (typeof DeviceOrientationEvent.requestPermission !== 'function') {
        setPermissionState('not required');
        window.addEventListener('deviceorientation', handleDeviceOrientation);
      }
    } else {
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    }

    animationRef.current = requestAnimationFrame(animatePointer);

    return () => {
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
      cancelAnimationFrame(animationRef.current);
    };
  }, [mode, handleDeviceOrientation, animatePointer, setShowPointer]);

  const handleModeToggle = () => {
    setMode(prevMode => prevMode === 'presentation' ? 'controller' : 'presentation');
  };

  const handlePointerToggle = () => {
    setShowPointer(prev => {
      const newState = !prev;
      if (newState) {
        calibrate();
      }
      sendMessage({ showPointer: newState });
      return newState;
    });
  };

  const calibrate = () => {
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', calibrationHandler, { once: true });
    }
  };

  const calibrationHandler = (event) => {
    if (event.beta !== null && event.gamma !== null) {
      setCalibrationData({
        beta: event.beta,
        gamma: event.gamma
      });
    }
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
          {typeof DeviceOrientationEvent.requestPermission === 'function' && permissionState !== 'granted' && (
            <button
              className="bg-blue-500 text-white px-4 py-2 rounded mt-4"
              onClick={requestOrientationPermission}
            >
              Request Orientation Permission
            </button>
          )}
          <div className="text-black text-xl mt-4">
            <p>Alpha: {orientationData.alpha}</p>
            <p>Beta: {orientationData.beta}</p>
            <p>Gamma: {orientationData.gamma}</p>
            <p>Pointer X: {pointerPosition.x.toFixed(2)}</p>
            <p>Pointer Y: {pointerPosition.y.toFixed(2)}</p>
            <p>DeviceOrientation Supported: {window.DeviceOrientationEvent ? 'Yes' : 'No'}</p>
            <p>Permission State: {permissionState}</p>
            <p>Show Pointer: {showPointer ? 'Yes' : 'No'}</p>
            <p>Calibration Data: {calibrationData ? 'Set' : 'Not Set'}</p>
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
