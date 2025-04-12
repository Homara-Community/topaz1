// compressor.js - Compressor effect module for Web Audio Instrument

/**
 * Compressor effect processor
 * Provides dynamic range compression
 */
class CompressorEffect {
    /**
     * Create a new compressor effect
     * @param {AudioContext} audioContext - The Web Audio API context
     */
    constructor(audioContext) {
        this.audioContext = audioContext;
        
        // Create compressor node
        this.compressor = audioContext.createDynamicsCompressor();
        
        // Set default values
        this.compressor.threshold.value = -24;
        this.compressor.knee.value = 30;
        this.compressor.ratio.value = 12;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;
        
        // Default parameters
        this.params = {
            threshold: -24,
            knee: 30,
            ratio: 12,
            attack: 0.003,
            release: 0.25
        };
    }
    
    /**
     * Connect the effect to an audio node
     * @param {AudioNode} source - The source node
     * @param {AudioNode} destination - The destination node
     * @returns {AudioNode} - The compressor node
     */
    connect(source, destination) {
        source.connect(this.compressor);
        this.compressor.connect(destination);
        return this.compressor;
    }
    
    /**
     * Set compressor threshold
     * @param {number} threshold - The threshold in dB
     */
    setThreshold(threshold) {
        const safeThreshold = Math.max(-100, Math.min(0, threshold));
        this.compressor.threshold.setValueAtTime(safeThreshold, this.audioContext.currentTime);
        this.params.threshold = safeThreshold;
    }
    
    /**
     * Set compressor knee
     * @param {number} knee - The knee width in dB
     */
    setKnee(knee) {
        const safeKnee = Math.max(0, Math.min(40, knee));
        this.compressor.knee.setValueAtTime(safeKnee, this.audioContext.currentTime);
        this.params.knee = safeKnee;
    }
    
    /**
     * Set compressor ratio
     * @param {number} ratio - The compression ratio
     */
    setRatio(ratio) {
        const safeRatio = Math.max(1, Math.min(20, ratio));
        this.compressor.ratio.setValueAtTime(safeRatio, this.audioContext.currentTime);
        this.params.ratio = safeRatio;
    }
    
    /**
     * Set compressor attack time
     * @param {number} attack - The attack time in seconds
     */
    setAttack(attack) {
        const safeAttack = Math.max(0, Math.min(1, attack));
        this.compressor.attack.setValueAtTime(safeAttack, this.audioContext.currentTime);
        this.params.attack = safeAttack;
    }
    
    /**
     * Set compressor release time
     * @param {number} release - The release time in seconds
     */
    setRelease(release) {
        const safeRelease = Math.max(0, Math.min(1, release));
        this.compressor.release.setValueAtTime(safeRelease, this.audioContext.currentTime);
        this.params.release = safeRelease;
    }
    
    /**
     * Get the compressor node
     * @returns {DynamicsCompressorNode} - The compressor node
     */
    getNode() {
        return this.compressor;
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
        if (params.threshold !== undefined) this.setThreshold(params.threshold);
        if (params.knee !== undefined) this.setKnee(params.knee);
        if (params.ratio !== undefined) this.setRatio(params.ratio);
        if (params.attack !== undefined) this.setAttack(params.attack);
        if (params.release !== undefined) this.setRelease(params.release);
    }
    
    /**
     * Get the current reduction amount
     * @returns {number} - The current reduction in dB
     */
    getReduction() {
        return this.compressor.reduction;
    }
}

export default CompressorEffect;
