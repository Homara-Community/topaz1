// audioEngine.js - Core audio processing module for Web Audio Instrument

// Audio Engine class to handle all audio-related operations
class AudioEngine {
    constructor() {
      this.audioContext = null;
      this.masterGain = null;
      this.analyser = null;
      
      // Audio effect nodes
      this.filter = null;
      this.delay = null;
      this.reverb = null;
      
      // Audio buffers storage
      this.buffers = {};
      
      // Active audio sources
      this.activeSources = {};
      
      // Frequency layers for splitting audio
      this.layers = {
        bass: { node: null, filter: null, gain: null, mute: false, solo: false, volume: 1 },
        mid: { node: null, filter: null, gain: null, mute: false, solo: false, volume: 1 },
        high: { node: null, filter: null, gain: null, mute: false, solo: false, volume: 1 }
      };
      
      // Event callbacks for UI updates
      this.onAnalyserUpdate = null;
    }
    
    // Initialize the audio context (must be called on user interaction)
    initialize() {
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create master gain node
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.8; // Set initial volume
      this.masterGain.connect(this.audioContext.destination);
      
      // Create analyser node
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.connect(this.masterGain);
      
      // Set up effects chain
      this.createEffectsChain();
      
      // Set up frequency layer nodes
      this.createFrequencyLayers();
      
      // Start analyser animation if callback is set
      if (this.onAnalyserUpdate) {
        this.startAnalyserAnimation();
      }
      
      return this.audioContext;
    }
    
    // Create audio effects chain
    createEffectsChain() {
      // Create filter
      this.filter = this.audioContext.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 20000; // Default to max frequency
      this.filter.Q.value = 1;
      
      // Create delay
      this.delay = this.audioContext.createDelay(5.0);
      this.delay.delayTime.value = 0;
      
      // Create feedback for delay
      const delayFeedback = this.audioContext.createGain();
      delayFeedback.gain.value = 0.3;
      
      // Create reverb (using gain for now as a simple wet/dry control)
      this.reverb = this.audioContext.createGain();
      this.reverb.gain.value = 0;
      
      // Create convolver for reverb (will need impulse response)
      this.convolver = this.audioContext.createConvolver();
      
      // Connect effects chain
      this.filter.connect(this.delay);
      this.delay.connect(delayFeedback);
      delayFeedback.connect(this.delay);
      this.delay.connect(this.reverb);
      this.reverb.connect(this.analyser);
      
      // Connect dry signal path to analyser too
      this.filter.connect(this.analyser);
      
      // Generate impulse response for reverb
      this.generateImpulseResponse();
    }
    
    // Create frequency layer nodes for splitting audio
    createFrequencyLayers() {
      // Bass layer (0-200Hz)
      this.layers.bass.filter = this.audioContext.createBiquadFilter();
      this.layers.bass.filter.type = 'lowpass';
      this.layers.bass.filter.frequency.value = 200;
      this.layers.bass.gain = this.audioContext.createGain();
      this.layers.bass.gain.gain.value = this.layers.bass.volume;
      this.layers.bass.filter.connect(this.layers.bass.gain);
      this.layers.bass.gain.connect(this.filter);
      
      // Mid layer (200Hz-2000Hz)
      this.layers.mid.filter = this.audioContext.createBiquadFilter();
      this.layers.mid.filter.type = 'bandpass';
      this.layers.mid.filter.frequency.value = 1000;
      this.layers.mid.filter.Q.value = 0.5;
      this.layers.mid.gain = this.audioContext.createGain();
      this.layers.mid.gain.gain.value = this.layers.mid.volume;
      this.layers.mid.filter.connect(this.layers.mid.gain);
      this.layers.mid.gain.connect(this.filter);
      
      // High layer (>2000Hz)
      this.layers.high.filter = this.audioContext.createBiquadFilter();
      this.layers.high.filter.type = 'highpass';
      this.layers.high.filter.frequency.value = 2000;
      this.layers.high.gain = this.audioContext.createGain();
      this.layers.high.gain.gain.value = this.layers.high.volume;
      this.layers.high.filter.connect(this.layers.high.gain);
      this.layers.high.gain.connect(this.filter);
    }
    
    // Generate impulse response for reverb effect
    generateImpulseResponse(duration = 2, decay = 2.0, reverse = false) {
      const sampleRate = this.audioContext.sampleRate;
      const length = sampleRate * duration;
      const impulse = this.audioContext.createBuffer(2, length, sampleRate);
      const impulseL = impulse.getChannelData(0);
      const impulseR = impulse.getChannelData(1);
      
      for (let i = 0; i < length; i++) {
        const n = reverse ? length - i : i;
        impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
        impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
      }
      
      this.convolver.buffer = impulse;
      this.reverb.connect(this.convolver);
      this.convolver.connect(this.analyser);
    }
    
    // Load and decode audio file
    async loadAudioFile(file) {
      return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        
        fileReader.onload = async (event) => {
          const arrayBuffer = event.target.result;
          
          try {
            // Decode audio data
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            const sampleId = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
            
            // Store buffer
            this.buffers[sampleId] = audioBuffer;
            resolve({ id: sampleId, buffer: audioBuffer });
          } catch (error) {
            reject(new Error(`Failed to decode audio data: ${error.message}`));
          }
        };
        
        fileReader.onerror = () => {
          reject(new Error('Error reading audio file'));
        };
        
        fileReader.readAsArrayBuffer(file);
      });
    }
    
    // Play a sample using its ID
    playSample(sampleId, layered = false) {
      if (!this.buffers[sampleId]) {
        return null;
      }
      
      // Create buffer source
      const source = this.audioContext.createBufferSource();
      source.buffer = this.buffers[sampleId];
      
      if (layered) {
        // Split into frequency layers
        source.connect(this.layers.bass.filter);
        source.connect(this.layers.mid.filter);
        source.connect(this.layers.high.filter);
      } else {
        // Direct connection to effects chain
        source.connect(this.filter);
      }
      
      // Start playback
      source.start(0);
      
      // Store active source
      this.activeSources[sampleId] = source;
      
      return source;
    }
    
    // Stop a sample by ID
    stopSample(sampleId) {
      if (this.activeSources[sampleId]) {
        try {
          this.activeSources[sampleId].stop();
        } catch (e) {
          // Source might have already stopped
        }
        delete this.activeSources[sampleId];
      }
    }
    
    // Stop all playing samples
    stopAllSamples() {
      Object.keys(this.activeSources).forEach(sampleId => {
        this.stopSample(sampleId);
      });
    }
    
    // Set filter frequency
    setFilterFrequency(value) {
      if (this.filter) {
        this.filter.frequency.setValueAtTime(value, this.audioContext.currentTime);
      }
    }
    
    // Set delay time
    setDelayTime(value) {
      if (this.delay) {
        this.delay.delayTime.setValueAtTime(value, this.audioContext.currentTime);
      }
    }
    
    // Set reverb level
    setReverbLevel(value) {
      if (this.reverb) {
        this.reverb.gain.setValueAtTime(value, this.audioContext.currentTime);
      }
    }
    
    // Set layer volume
    setLayerVolume(layerId, value) {
      if (this.layers[layerId] && this.layers[layerId].gain) {
        this.layers[layerId].volume = value;
        this.layers[layerId].gain.gain.setValueAtTime(value, this.audioContext.currentTime);
      }
    }
    
    // Toggle layer solo
    toggleLayerSolo(layerId) {
      if (!this.layers[layerId]) return;
      
      // Toggle solo state for the selected layer
      this.layers[layerId].solo = !this.layers[layerId].solo;
      
      // Update all layer gains based on solo status
      this.updateLayerStates();
      
      return this.layers[layerId].solo;
    }
    
    // Toggle layer mute
    toggleLayerMute(layerId) {
      if (!this.layers[layerId]) return;
      
      // Toggle mute state for the selected layer
      this.layers[layerId].mute = !this.layers[layerId].mute;
      
      // Update all layer gains based on mute status
      this.updateLayerStates();
      
      return this.layers[layerId].mute;
    }
    
    // Update layer states based on solo/mute settings
    updateLayerStates() {
      // Check if any layer is soloed
      const anySolo = Object.values(this.layers).some(layer => layer.solo);
      
      // Set gain values based on solo/mute status
      for (const id in this.layers) {
        const layer = this.layers[id];
        if (!layer.gain) continue;
        
        let gainValue = 0;
        
        if (anySolo) {
          // If any track is soloed, play only soloed tracks
          gainValue = layer.solo ? layer.volume : 0;
        } else {
          // Otherwise respect mute status
          gainValue = layer.mute ? 0 : layer.volume;
        }
        
        layer.gain.gain.setValueAtTime(gainValue, this.audioContext.currentTime);
      }
    }
    
    // Get frequency data for visualization
    getFrequencyData() {
      if (!this.analyser) return null;
      
      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.analyser.getByteFrequencyData(dataArray);
      
      return {
        data: dataArray,
        bufferLength: bufferLength
      };
    }
    
    // Split a sample into frequency bands (basic implementation)
    splitSampleLayers(sampleId) {
      // In a real implementation, this would use more sophisticated DSP
      // For now, we'll just return the original sample with different filter settings
      return {
        bass: this.buffers[sampleId],
        mid: this.buffers[sampleId],
        high: this.buffers[sampleId]
      };
    }
    
    // Start analyser animation
    startAnalyserAnimation() {
      const updateAnalyser = () => {
        if (this.onAnalyserUpdate) {
          const frequencyData = this.getFrequencyData();
          if (frequencyData) {
            this.onAnalyserUpdate(frequencyData);
          }
        }
        requestAnimationFrame(updateAnalyser);
      };
      
      requestAnimationFrame(updateAnalyser);
    }
    
    // Set analyser update callback
    setAnalyserCallback(callback) {
      this.onAnalyserUpdate = callback;
      
      if (this.analyser && callback) {
        this.startAnalyserAnimation();
      }
    }
    
    // Get current audio context time
    getCurrentTime() {
      return this.audioContext ? this.audioContext.currentTime : 0;
    }
    
    // Check if audio context is running
    isRunning() {
      return this.audioContext && this.audioContext.state === 'running';
    }
    
    // Resume audio context if suspended
    resume() {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        return this.audioContext.resume();
      }
      return Promise.resolve();
    }
    
    // Set master volume
    setMasterVolume(value) {
      if (this.masterGain) {
        this.masterGain.gain.setValueAtTime(value, this.audioContext.currentTime);
      }
    }
  }
  
  // Export as singleton
  export default new AudioEngine();