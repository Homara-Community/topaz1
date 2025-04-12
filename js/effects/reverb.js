// reverb.js - Reverb effect module for Web Audio Instrument

/**
 * Reverb effect processor
 * Provides convolution reverb with impulse response generation
 */
class ReverbEffect {
    /**
     * Create a new reverb effect
     * @param {AudioContext} audioContext - The Web Audio API context
     */
    constructor(audioContext) {
        this.audioContext = audioContext;
        
        // Create nodes
        this.inputNode = audioContext.createGain();
        this.outputNode = audioContext.createGain();
        this.dryGainNode = audioContext.createGain();
        this.wetGainNode = audioContext.createGain();
        this.convolverNode = audioContext.createConvolver();
        
        // Set default values
        this.dryGainNode.gain.value = 1.0;
        this.wetGainNode.gain.value = 0.0;
        
        // Connect nodes
        // Input -> Dry -> Output
        this.inputNode.connect(this.dryGainNode);
        this.dryGainNode.connect(this.outputNode);
        
        // Input -> Convolver -> Wet -> Output
        this.inputNode.connect(this.convolverNode);
        this.convolverNode.connect(this.wetGainNode);
        this.wetGainNode.connect(this.outputNode);
        
        // Default parameters
        this.params = {
            mix: 0.0,
            decayTime: 2.0,
            preDelay: 0.01,
            tone: 0.5
        };
        
        // Generate default impulse response
        this.generateImpulseResponse(this.params.decayTime, this.params.preDelay, this.params.tone);
    }
    
    /**
     * Connect the effect to an audio node
     * @param {AudioNode} source - The source node
     * @param {AudioNode} destination - The destination node
     * @returns {AudioNode} - The output node
     */
    connect(source, destination) {
        source.connect(this.inputNode);
        this.outputNode.connect(destination);
        return this.outputNode;
    }
    
    /**
     * Set wet/dry mix
     * @param {number} mix - The wet/dry mix (0-1)
     */
    setMix(mix) {
        const safeMix = Math.max(0, Math.min(1, mix));
        this.wetGainNode.gain.setValueAtTime(safeMix, this.audioContext.currentTime);
        this.dryGainNode.gain.setValueAtTime(1 - safeMix, this.audioContext.currentTime);
        this.params.mix = safeMix;
    }
    
    /**
     * Generate an impulse response
     * @param {number} decayTime - The decay time in seconds
     * @param {number} preDelay - The pre-delay time in seconds
     * @param {number} tone - The tone control (0-1, where 0 is darker, 1 is brighter)
     */
    generateImpulseResponse(decayTime = 2.0, preDelay = 0.01, tone = 0.5) {
        // Clamp parameters to safe values
        decayTime = Math.max(0.1, Math.min(10, decayTime));
        preDelay = Math.max(0, Math.min(0.1, preDelay));
        tone = Math.max(0, Math.min(1, tone));
        
        // Update parameters
        this.params.decayTime = decayTime;
        this.params.preDelay = preDelay;
        this.params.tone = tone;
        
        // Create an impulse response buffer
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * decayTime;
        const impulseResponse = this.audioContext.createBuffer(2, length, sampleRate);
        
        // Get buffer channels
        const leftChannel = impulseResponse.getChannelData(0);
        const rightChannel = impulseResponse.getChannelData(1);
        
        // Calculate pre-delay in samples
        const preDelaySamples = Math.floor(preDelay * sampleRate);
        
        // Fill the buffer with noise and apply decay
        for (let i = 0; i < length; i++) {
            // Apply pre-delay
            if (i < preDelaySamples) {
                leftChannel[i] = 0;
                rightChannel[i] = 0;
                continue;
            }
            
            // Generate random noise
            const noise = Math.random() * 2 - 1;
            
            // Apply decay envelope
            const decay = Math.exp(-i / (sampleRate * decayTime));
            
            // Apply tone control (simple lowpass filter approximation)
            const toneFilter = Math.exp(-i / (sampleRate * (0.1 + tone * 2)));
            
            // Combine effects
            const value = noise * decay * toneFilter;
            
            // Slightly different values for left and right channels for stereo effect
            leftChannel[i] = value;
            rightChannel[i] = value * (Math.random() * 0.2 + 0.9); // 90-110% of left channel
        }
        
        // Set the impulse response
        this.convolverNode.buffer = impulseResponse;
    }
    
    /**
     * Load an impulse response from a file
     * @param {ArrayBuffer} buffer - The audio file buffer
     * @returns {Promise} - Resolves when the impulse response is loaded
     */
    async loadImpulseResponse(buffer) {
        try {
            const audioBuffer = await this.audioContext.decodeAudioData(buffer);
            this.convolverNode.buffer = audioBuffer;
            return audioBuffer;
        } catch (error) {
            console.error('Error loading impulse response:', error);
            throw error;
        }
    }
    
    /**
     * Get the input node
     * @returns {GainNode} - The input node
     */
    getInputNode() {
        return this.inputNode;
    }
    
    /**
     * Get the output node
     * @returns {GainNode} - The output node
     */
    getOutputNode() {
        return this.outputNode;
    }
    
    /**
     * Get current parameters
     * @returns {Object} - The current parameters
     */
    getParams() {
        return { ...this.params };
    }
    
    /**
     * Set all parameters at once
     * @param {Object} params - The parameters to set
     */
    setParams(params) {
        let shouldRegenerate = false;
        
        if (params.mix !== undefined) {
            this.setMix(params.mix);
        }
        
        if (params.decayTime !== undefined) {
            this.params.decayTime = Math.max(0.1, Math.min(10, params.decayTime));
            shouldRegenerate = true;
        }
        
        if (params.preDelay !== undefined) {
            this.params.preDelay = Math.max(0, Math.min(0.1, params.preDelay));
            shouldRegenerate = true;
        }
        
        if (params.tone !== undefined) {
            this.params.tone = Math.max(0, Math.min(1, params.tone));
            shouldRegenerate = true;
        }
        
        if (shouldRegenerate) {
            this.generateImpulseResponse(
                this.params.decayTime,
                this.params.preDelay,
                this.params.tone
            );
        }
    }
}

export default ReverbEffect;
