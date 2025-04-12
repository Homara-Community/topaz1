// delay.js - Delay effect module for Web Audio Instrument

/**
 * Delay effect processor
 * Provides delay with feedback and mix control
 */
class DelayEffect {
    /**
     * Create a new delay effect
     * @param {AudioContext} audioContext - The Web Audio API context
     */
    constructor(audioContext) {
        this.audioContext = audioContext;
        
        // Create nodes
        this.inputNode = audioContext.createGain();
        this.outputNode = audioContext.createGain();
        this.dryGainNode = audioContext.createGain();
        this.wetGainNode = audioContext.createGain();
        this.delayNode = audioContext.createDelay(5.0);
        this.feedbackNode = audioContext.createGain();
        
        // Set default values
        this.delayNode.delayTime.value = 0.3;
        this.feedbackNode.gain.value = 0.4;
        this.dryGainNode.gain.value = 1.0;
        this.wetGainNode.gain.value = 0.5;
        
        // Connect nodes
        // Input -> Dry -> Output
        this.inputNode.connect(this.dryGainNode);
        this.dryGainNode.connect(this.outputNode);
        
        // Input -> Delay -> Wet -> Output
        this.inputNode.connect(this.delayNode);
        this.delayNode.connect(this.wetGainNode);
        this.wetGainNode.connect(this.outputNode);
        
        // Feedback loop: Delay -> Feedback -> Delay
        this.delayNode.connect(this.feedbackNode);
        this.feedbackNode.connect(this.delayNode);
        
        // Default parameters
        this.params = {
            delayTime: 0.3,
            feedback: 0.4,
            mix: 0.5
        };
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
     * Set delay time
     * @param {number} time - The delay time in seconds
     */
    setDelayTime(time) {
        const safeTime = Math.max(0, Math.min(5, time));
        this.delayNode.delayTime.setValueAtTime(safeTime, this.audioContext.currentTime);
        this.params.delayTime = safeTime;
    }
    
    /**
     * Set feedback amount
     * @param {number} amount - The feedback amount (0-1)
     */
    setFeedback(amount) {
        const safeAmount = Math.max(0, Math.min(0.95, amount));
        this.feedbackNode.gain.setValueAtTime(safeAmount, this.audioContext.currentTime);
        this.params.feedback = safeAmount;
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
        if (params.delayTime !== undefined) this.setDelayTime(params.delayTime);
        if (params.feedback !== undefined) this.setFeedback(params.feedback);
        if (params.mix !== undefined) this.setMix(params.mix);
    }
    
    /**
     * Create a tap delay (multiple delay times)
     * @param {Array<number>} times - Array of delay times in seconds
     * @param {Array<number>} gains - Array of gain values for each tap
     */
    createTapDelay(times, gains) {
        // Disconnect existing delay setup
        this.inputNode.disconnect(this.delayNode);
        this.delayNode.disconnect();
        
        // Create new delay nodes for each tap
        const tapDelays = times.map((time, index) => {
            const delay = this.audioContext.createDelay(5.0);
            delay.delayTime.value = time;
            
            const gain = this.audioContext.createGain();
            gain.gain.value = gains[index] || 0.5;
            
            this.inputNode.connect(delay);
            delay.connect(gain);
            gain.connect(this.wetGainNode);
            
            return { delay, gain };
        });
        
        return tapDelays;
    }
}

export default DelayEffect;
