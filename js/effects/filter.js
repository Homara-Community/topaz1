// filter.js - Filter effect module for Web Audio Instrument

/**
 * Filter effect processor
 * Provides different filter types (lowpass, highpass, bandpass, etc.)
 */
class FilterEffect {
    /**
     * Create a new filter effect
     * @param {AudioContext} audioContext - The Web Audio API context
     */
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.filter = audioContext.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 20000; // Default to max frequency
        this.filter.Q.value = 1;
        this.filter.gain.value = 0;
        
        // Default parameters
        this.params = {
            type: 'lowpass',
            frequency: 20000,
            Q: 1,
            gain: 0
        };
        
        // Available filter types
        this.filterTypes = [
            'lowpass',
            'highpass',
            'bandpass',
            'lowshelf',
            'highshelf',
            'peaking',
            'notch',
            'allpass'
        ];
    }
    
    /**
     * Connect the effect to an audio node
     * @param {AudioNode} source - The source node
     * @param {AudioNode} destination - The destination node
     * @returns {AudioNode} - The filter node
     */
    connect(source, destination) {
        source.connect(this.filter);
        this.filter.connect(destination);
        return this.filter;
    }
    
    /**
     * Set filter type
     * @param {string} type - The filter type
     */
    setType(type) {
        if (this.filterTypes.includes(type)) {
            this.filter.type = type;
            this.params.type = type;
        } else {
            console.warn(`Invalid filter type: ${type}`);
        }
    }
    
    /**
     * Set filter frequency
     * @param {number} frequency - The frequency in Hz
     */
    setFrequency(frequency) {
        const minFreq = 20;
        const maxFreq = 20000;
        const safeFreq = Math.max(minFreq, Math.min(maxFreq, frequency));
        
        this.filter.frequency.setValueAtTime(safeFreq, this.audioContext.currentTime);
        this.params.frequency = safeFreq;
    }
    
    /**
     * Set filter Q factor
     * @param {number} q - The Q factor
     */
    setQ(q) {
        const safeQ = Math.max(0.0001, Math.min(1000, q));
        this.filter.Q.setValueAtTime(safeQ, this.audioContext.currentTime);
        this.params.Q = safeQ;
    }
    
    /**
     * Set filter gain (for peaking and shelf filters)
     * @param {number} gain - The gain in dB
     */
    setGain(gain) {
        const safeGain = Math.max(-40, Math.min(40, gain));
        this.filter.gain.setValueAtTime(safeGain, this.audioContext.currentTime);
        this.params.gain = safeGain;
    }
    
    /**
     * Get the filter node
     * @returns {BiquadFilterNode} - The filter node
     */
    getNode() {
        return this.filter;
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
        if (params.type) this.setType(params.type);
        if (params.frequency) this.setFrequency(params.frequency);
        if (params.Q) this.setQ(params.Q);
        if (params.gain) this.setGain(params.gain);
    }
    
    /**
     * Create a frequency response data array for visualization
     * @param {number} width - The width of the visualization
     * @returns {Float32Array} - The frequency response data
     */
    getFrequencyResponse(width = 100) {
        const frequencies = new Float32Array(width);
        const magResponse = new Float32Array(width);
        const phaseResponse = new Float32Array(width);
        
        // Generate logarithmically spaced frequencies
        for (let i = 0; i < width; i++) {
            frequencies[i] = 20 * Math.pow(10, i / width * 3); // 20Hz to 20kHz
        }
        
        this.filter.getFrequencyResponse(frequencies, magResponse, phaseResponse);
        
        return {
            frequencies,
            magResponse,
            phaseResponse
        };
    }
}

export default FilterEffect;
