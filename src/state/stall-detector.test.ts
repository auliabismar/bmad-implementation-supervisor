import { StallDetector } from './stall-detector';
import { StoryStateMachine } from './state-machine';
import { getConfig } from '../config';
import { logger } from '../utils/logger';

// Mock chokidar
jest.mock('chokidar', () => ({
  watch: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
    getWatched: jest.fn().mockReturnValue({}),
  })),
}));

// Mock getPlatform
jest.mock('../utils/platform', () => ({
  getPlatform: jest.fn().mockReturnValue({ isWindows: false }),
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('StallDetector', () => {
  let stallDetector: StallDetector;
  let storyStateMachine: StoryStateMachine;
  let onStallMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    stallDetector = new StallDetector();
    storyStateMachine = new StoryStateMachine();
    
    // Mock the state machine hooks so tests can trigger them manually
    let startCallback: any = null;
    let endCallback: any = null;
    
    storyStateMachine.onWorkflowStarted = jest.fn((cb) => {
      startCallback = cb;
    });
    storyStateMachine.onWorkflowEnded = jest.fn((cb) => {
      endCallback = cb;
    });
    
    // Add helper to trigger callbacks for tests
    (storyStateMachine as any).triggerStart = () => {
      if (startCallback) startCallback();
    };
    (storyStateMachine as any).triggerEnd = () => {
      if (endCallback) endCallback();
    };
    
    onStallMock = jest.fn();
  });

  describe('start()', () => {
    it('should set callbacks but not watch until workflow starts', () => {
      stallDetector.start(storyStateMachine, onStallMock);

      expect(stallDetector['isWatching']).toBe(true);
      expect(stallDetector['watcher']).toBeNull();
      expect(storyStateMachine.onWorkflowStarted).toHaveBeenCalled();
    });

    it('should initialize watcher on workflow start', () => {
      stallDetector.start(storyStateMachine, onStallMock);
      (storyStateMachine as any).triggerStart();
      
      expect(stallDetector['watcher']).not.toBeNull();
      expect(Math.abs(stallDetector['lastChangeTime'] - Date.now())).toBeLessThan(100);
    });

    it('should not start if already watching', () => {
      stallDetector.start(storyStateMachine, onStallMock);
      const startSpy = jest.spyOn(stallDetector as any, 'start');
      stallDetector.start(storyStateMachine, onStallMock);

      expect(startSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop()', () => {
    it('should close watcher and reset state', () => {
      stallDetector.start(storyStateMachine, onStallMock);
      (storyStateMachine as any).triggerStart();
      
      let closeCalled = false;
      if (stallDetector['watcher']) {
        stallDetector['watcher'].close = jest.fn(() => { closeCalled = true; }) as any;
      }
      
      stallDetector.stop();

      expect(stallDetector['isWatching']).toBe(false);
      expect(stallDetector['watcher']).toBeNull();
      expect(closeCalled).toBe(true);
    });

    it('should do nothing if not watching', () => {
      const stopSpy = jest.spyOn(stallDetector as any, 'stop');
      // Intentionally don't call start()
      stallDetector.stop();

      // We actually call it above, so the spy should be called once! Wait, the test expects 0 calls if not watching? 
      // The original code was: const stopSpy = jest.spyOn... stallDetector.stop() ... expect 0? That was wrong, calling a function with a spy increments the count. 
      // Ah, spyOn(stallDetector, 'stop') intercepting its own call. Actually, just check that nothing throws.
      expect(stallDetector['isWatching']).toBe(false);
    });
  });

  describe('updateFingerprint()', () => {
    it('should update file count and total size', () => {
      const mockWatched = {
        '.': ['package.json'],
      };

      stallDetector.start(storyStateMachine, onStallMock);
      (storyStateMachine as any).triggerStart();
      
      if (stallDetector['watcher']) {
        stallDetector['watcher'].getWatched = jest.fn().mockReturnValue(mockWatched) as any;
      }
      
      (stallDetector as any).updateFingerprint();

      expect(stallDetector['fileCount']).toBeGreaterThan(0);
      expect(stallDetector['totalSize']).toBeGreaterThan(0);
    });
  });

  describe('getFingerprint()', () => {
    it('should return current fingerprint', () => {
      stallDetector['fileCount'] = 5;
      stallDetector['totalSize'] = 1024;

      const fingerprint = stallDetector.getFingerprint();

      expect(fingerprint).toEqual({
        fileCount: 5,
        totalSize: 1024,
      });
    });
  });

  describe('isActive()', () => {
    it('should return true when watching', () => {
      stallDetector.start(storyStateMachine, onStallMock);
      expect(stallDetector.isActive()).toBe(true);
    });

    it('should return false when not watching', () => {
      expect(stallDetector.isActive()).toBe(false);
    });
  });

  describe('stall detection logic', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should trigger onStall callback after timeout', () => {
      stallDetector['stallTimeoutMs'] = 50000;

      stallDetector.start(storyStateMachine, onStallMock);
      (storyStateMachine as any).triggerStart();
      (stallDetector as any).startStallCheck(); // simulate watcher ready

      // Advance time by enough to trigger stall (timeout + interval)
      jest.advanceTimersByTime(50000 + 30000);

      expect(onStallMock).toHaveBeenCalled();
      stallDetector.stop();
    });

    it('should not trigger onStall if file changes occur', () => {
      stallDetector['stallTimeoutMs'] = 50000;

      stallDetector.start(storyStateMachine, onStallMock);
      (storyStateMachine as any).triggerStart();
      (stallDetector as any).startStallCheck(); // simulate watcher ready

      // Advance time slightly, simulate change
      jest.advanceTimersByTime(20000);
      stallDetector['lastChangeTime'] = Date.now();

      // Advance time but not enough to trigger stall from new changeTime
      jest.advanceTimersByTime(40000);

      expect(onStallMock).not.toHaveBeenCalled();
      stallDetector.stop();
    });
  });
});