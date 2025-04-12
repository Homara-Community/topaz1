// fileHandler.js - Handles file operations for Web Audio Instrument

class FileHandler {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.audioBuffers = {};
        this.videoElements = {};
        this.mediaSourceNodes = {};
        this.loopPoints = {}; // Store loop start/end points for each file
        
        // Supported file types
        this.supportedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-m4a'];
        this.supportedVideoTypes = ['video/mp4', 'video/webm'];
        
        // Event callbacks
        this.onFileLoaded = null;
        this.onFileLoadError = null;
        this.onAllFilesProcessed = null;
        this.onExtractComplete = null;
    }
    
    /**
     * Initialize the file handler
     * @param {AudioContext} audioContext - The Web Audio API context
     */
    initialize(audioContext) {
        if (audioContext) {
            this.audioContext = audioContext;
        }
        
        if (!this.audioContext) {
            throw new Error('AudioContext is required for FileHandler');
        }
        
        return this;
    }
    
    /**
     * Process files from a file input or drop event
     * @param {FileList} files - The files to process
     * @returns {Promise} - Resolves when all files are processed
     */
    async processFiles(files) {
        const promises = [];
        const results = {
            loaded: [],
            errors: [],
            unsupported: []
        };
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            // Check if file type is supported
            if (this.isAudioFile(file)) {
                promises.push(
                    this.processAudioFile(file)
                        .then(result => {
                            results.loaded.push(result);
                            if (this.onFileLoaded) this.onFileLoaded(result);
                            return result;
                        })
                        .catch(error => {
                            const errorResult = { file, error };
                            results.errors.push(errorResult);
                            if (this.onFileLoadError) this.onFileLoadError(errorResult);
                            return errorResult;
                        })
                );
            } else if (this.isVideoFile(file)) {
                promises.push(
                    this.processVideoFile(file)
                        .then(result => {
                            results.loaded.push(result);
                            if (this.onFileLoaded) this.onFileLoaded(result);
                            return result;
                        })
                        .catch(error => {
                            const errorResult = { file, error };
                            results.errors.push(errorResult);
                            if (this.onFileLoadError) this.onFileLoadError(errorResult);
                            return errorResult;
                        })
                );
            } else {
                const unsupportedResult = { 
                    file, 
                    error: new Error(`Unsupported file type: ${file.type}`) 
                };
                results.unsupported.push(unsupportedResult);
                if (this.onFileLoadError) this.onFileLoadError(unsupportedResult);
            }
        }
        
        await Promise.all(promises);
        
        if (this.onAllFilesProcessed) {
            this.onAllFilesProcessed(results);
        }
        
        return results;
    }
    
    /**
     * Process an audio file
     * @param {File} file - The audio file to process
     * @returns {Promise} - Resolves with the processed audio data
     */
    async processAudioFile(file) {
        return new Promise((resolve, reject) => {
            const fileReader = new FileReader();
            
            fileReader.onload = async (event) => {
                try {
                    const arrayBuffer = event.target.result;
                    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    const sampleId = this.generateSampleId(file);
                    
                    // Store buffer
                    this.audioBuffers[sampleId] = audioBuffer;
                    
                    // Initialize loop points to full file duration
                    this.loopPoints[sampleId] = {
                        start: 0,
                        end: audioBuffer.duration
                    };
                    
                    resolve({
                        id: sampleId,
                        type: 'audio',
                        file: file,
                        buffer: audioBuffer,
                        duration: audioBuffer.duration
                    });
                } catch (error) {
                    reject(new Error(`Failed to decode audio data: ${error.message}`));
                }
            };
            
            fileReader.onerror = () => {
                reject(new Error(`Error reading audio file: ${file.name}`));
            };
            
            fileReader.readAsArrayBuffer(file);
        });
    }
    
    /**
     * Process a video file (MP4)
     * @param {File} file - The video file to process
     * @returns {Promise} - Resolves with the processed video and audio data
     */
    async processVideoFile(file) {
        return new Promise((resolve, reject) => {
            // Create a video element to extract audio
            const video = document.createElement('video');
            video.preload = 'metadata';
            
            // Create object URL for the file
            const objectURL = URL.createObjectURL(file);
            video.src = objectURL;
            
            // Wait for metadata to load
            video.onloadedmetadata = async () => {
                try {
                    const sampleId = this.generateSampleId(file);
                    
                    // Store video element for later use
                    this.videoElements[sampleId] = video;
                    
                    // Initialize loop points to full video duration
                    this.loopPoints[sampleId] = {
                        start: 0,
                        end: video.duration
                    };
                    
                    // Extract audio from video
                    const audioBuffer = await this.extractAudioFromVideo(video, sampleId);
                    
                    resolve({
                        id: sampleId,
                        type: 'video',
                        file: file,
                        buffer: audioBuffer,
                        videoElement: video,
                        duration: video.duration,
                        objectURL: objectURL
                    });
                } catch (error) {
                    URL.revokeObjectURL(objectURL);
                    reject(new Error(`Failed to process video file: ${error.message}`));
                }
            };
            
            video.onerror = () => {
                URL.revokeObjectURL(objectURL);
                reject(new Error(`Error loading video file: ${file.name}`));
            };
        });
    }
    
    /**
     * Extract audio from a video element
     * @param {HTMLVideoElement} videoElement - The video element
     * @param {string} sampleId - The sample ID
     * @returns {Promise} - Resolves with the extracted audio buffer
     */
    async extractAudioFromVideo(videoElement, sampleId) {
        return new Promise((resolve, reject) => {
            try {
                // Create a media element source
                const mediaSource = this.audioContext.createMediaElementSource(videoElement);
                this.mediaSourceNodes[sampleId] = mediaSource;
                
                // Create a destination to capture the audio
                const destination = this.audioContext.createMediaStreamDestination();
                mediaSource.connect(destination);
                
                // Create a MediaRecorder to record the audio
                const mediaRecorder = new MediaRecorder(destination.stream);
                const audioChunks = [];
                
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };
                
                mediaRecorder.onstop = async () => {
                    try {
                        // Create a blob from the audio chunks
                        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                        
                        // Convert blob to array buffer
                        const arrayBuffer = await audioBlob.arrayBuffer();
                        
                        // Decode the audio data
                        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                        
                        // Store the audio buffer
                        this.audioBuffers[sampleId] = audioBuffer;
                        
                        if (this.onExtractComplete) {
                            this.onExtractComplete({
                                id: sampleId,
                                buffer: audioBuffer
                            });
                        }
                        
                        resolve(audioBuffer);
                    } catch (error) {
                        reject(new Error(`Failed to process extracted audio: ${error.message}`));
                    }
                };
                
                // Start recording
                mediaRecorder.start();
                
                // Play the video (muted) to extract audio
                videoElement.muted = true;
                videoElement.currentTime = 0;
                videoElement.play();
                
                // Record for the duration of the video
                setTimeout(() => {
                    videoElement.pause();
                    mediaRecorder.stop();
                }, videoElement.duration * 1000);
            } catch (error) {
                reject(new Error(`Failed to extract audio from video: ${error.message}`));
            }
        });
    }
    
    /**
     * Split audio into frequency layers (bass, mid, high)
     * @param {string} sampleId - The sample ID to split
     * @returns {Object} - The layer nodes
     */
    splitIntoLayers(sampleId) {
        if (!this.audioBuffers[sampleId]) {
            throw new Error(`Sample not found: ${sampleId}`);
        }
        
        const audioBuffer = this.audioBuffers[sampleId];
        
        // Create filter nodes for each frequency range
        const bassFilter = this.audioContext.createBiquadFilter();
        bassFilter.type = 'lowpass';
        bassFilter.frequency.value = 250;
        
        const midFilter1 = this.audioContext.createBiquadFilter();
        midFilter1.type = 'highpass';
        midFilter1.frequency.value = 250;
        
        const midFilter2 = this.audioContext.createBiquadFilter();
        midFilter2.type = 'lowpass';
        midFilter2.frequency.value = 2500;
        
        const highFilter = this.audioContext.createBiquadFilter();
        highFilter.type = 'highpass';
        highFilter.frequency.value = 2500;
        
        // Create gain nodes for each layer
        const bassGain = this.audioContext.createGain();
        const midGain = this.audioContext.createGain();
        const highGain = this.audioContext.createGain();
        
        // Connect filters to gains
        bassFilter.connect(bassGain);
        
        midFilter1.connect(midFilter2);
        midFilter2.connect(midGain);
        
        highFilter.connect(highGain);
        
        // Return the layer nodes
        return {
            source: null, // Will be created when playing
            filters: {
                bass: bassFilter,
                mid: [midFilter1, midFilter2],
                high: highFilter
            },
            gains: {
                bass: bassGain,
                mid: midGain,
                high: highGain
            }
        };
    }
    
    /**
     * Set loop points for a sample
     * @param {string} sampleId - The sample ID
     * @param {number} startTime - Loop start time in seconds
     * @param {number} endTime - Loop end time in seconds
     */
    setLoopPoints(sampleId, startTime, endTime) {
        if (!this.audioBuffers[sampleId] && !this.videoElements[sampleId]) {
            throw new Error(`Sample not found: ${sampleId}`);
        }
        
        // Validate loop points
        const duration = this.audioBuffers[sampleId]?.duration || 
                         this.videoElements[sampleId]?.duration || 0;
        
        if (startTime < 0 || startTime >= duration) {
            throw new Error(`Invalid loop start time: ${startTime}`);
        }
        
        if (endTime <= startTime || endTime > duration) {
            throw new Error(`Invalid loop end time: ${endTime}`);
        }
        
        // Store loop points
        this.loopPoints[sampleId] = {
            start: startTime,
            end: endTime
        };
        
        return this.loopPoints[sampleId];
    }
    
    /**
     * Get loop points for a sample
     * @param {string} sampleId - The sample ID
     * @returns {Object} - The loop points
     */
    getLoopPoints(sampleId) {
        return this.loopPoints[sampleId] || null;
    }
    
    /**
     * Create a looped buffer from a sample with the current loop points
     * @param {string} sampleId - The sample ID
     * @returns {AudioBuffer} - The looped buffer
     */
    createLoopBuffer(sampleId) {
        if (!this.audioBuffers[sampleId]) {
            throw new Error(`Sample not found: ${sampleId}`);
        }
        
        const sourceBuffer = this.audioBuffers[sampleId];
        const loopPoints = this.loopPoints[sampleId];
        
        if (!loopPoints) {
            return sourceBuffer; // Return the original buffer if no loop points
        }
        
        // Calculate loop duration in samples
        const sampleRate = sourceBuffer.sampleRate;
        const startSample = Math.floor(loopPoints.start * sampleRate);
        const endSample = Math.floor(loopPoints.end * sampleRate);
        const loopLength = endSample - startSample;
        
        // Create a new buffer for the loop
        const loopBuffer = this.audioContext.createBuffer(
            sourceBuffer.numberOfChannels,
            loopLength,
            sampleRate
        );
        
        // Copy the loop section from the source buffer
        for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel++) {
            const sourceData = sourceBuffer.getChannelData(channel);
            const loopData = loopBuffer.getChannelData(channel);
            
            for (let i = 0; i < loopLength; i++) {
                loopData[i] = sourceData[startSample + i];
            }
        }
        
        return loopBuffer;
    }
    
    /**
     * Play a sample with loop
     * @param {string} sampleId - The sample ID
     * @param {AudioNode} destination - The destination node
     * @param {boolean} loop - Whether to loop the sample
     * @returns {AudioBufferSourceNode} - The source node
     */
    playSample(sampleId, destination, loop = false) {
        if (!this.audioBuffers[sampleId]) {
            throw new Error(`Sample not found: ${sampleId}`);
        }
        
        const source = this.audioContext.createBufferSource();
        
        if (loop && this.loopPoints[sampleId]) {
            // Use the original buffer with loop points
            source.buffer = this.audioBuffers[sampleId];
            source.loop = true;
            source.loopStart = this.loopPoints[sampleId].start;
            source.loopEnd = this.loopPoints[sampleId].end;
        } else {
            // Use the original buffer without looping
            source.buffer = this.audioBuffers[sampleId];
            source.loop = loop;
        }
        
        source.connect(destination);
        source.start(0);
        
        return source;
    }
    
    /**
     * Play a video sample
     * @param {string} sampleId - The sample ID
     * @param {boolean} loop - Whether to loop the video
     * @returns {HTMLVideoElement} - The video element
     */
    playVideoSample(sampleId, loop = false) {
        if (!this.videoElements[sampleId]) {
            throw new Error(`Video sample not found: ${sampleId}`);
        }
        
        const video = this.videoElements[sampleId];
        video.loop = loop;
        
        if (loop && this.loopPoints[sampleId]) {
            // Set up timeupdate event to handle manual looping with specific points
            const handleTimeUpdate = () => {
                if (video.currentTime >= this.loopPoints[sampleId].end) {
                    video.currentTime = this.loopPoints[sampleId].start;
                }
            };
            
            video.addEventListener('timeupdate', handleTimeUpdate);
            
            // Store the event listener for later removal
            video._loopHandler = handleTimeUpdate;
            
            // Start from loop start point
            video.currentTime = this.loopPoints[sampleId].start;
        } else {
            // Remove any existing loop handler
            if (video._loopHandler) {
                video.removeEventListener('timeupdate', video._loopHandler);
                delete video._loopHandler;
            }
            
            video.currentTime = 0;
        }
        
        video.play();
        
        return video;
    }
    
    /**
     * Stop a video sample
     * @param {string} sampleId - The sample ID
     */
    stopVideoSample(sampleId) {
        if (!this.videoElements[sampleId]) {
            return;
        }
        
        const video = this.videoElements[sampleId];
        video.pause();
        
        // Remove any loop handler
        if (video._loopHandler) {
            video.removeEventListener('timeupdate', video._loopHandler);
        }
    }
    
    /**
     * Generate a unique sample ID from a file
     * @param {File} file - The file
     * @returns {string} - The sample ID
     */
    generateSampleId(file) {
        // Remove extension and replace spaces with underscores
        return file.name
            .replace(/\.[^/.]+$/, "")
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9_]/g, '');
    }
    
    /**
     * Check if a file is an audio file
     * @param {File} file - The file to check
     * @returns {boolean} - Whether the file is an audio file
     */
    isAudioFile(file) {
        return this.supportedAudioTypes.includes(file.type);
    }
    
    /**
     * Check if a file is a video file
     * @param {File} file - The file to check
     * @returns {boolean} - Whether the file is a video file
     */
    isVideoFile(file) {
        return this.supportedVideoTypes.includes(file.type);
    }
    
    /**
     * Get all loaded samples
     * @returns {Object} - The loaded samples
     */
    getAllSamples() {
        const samples = {};
        
        // Add audio samples
        for (const id in this.audioBuffers) {
            samples[id] = {
                id,
                type: this.videoElements[id] ? 'video' : 'audio',
                buffer: this.audioBuffers[id],
                duration: this.audioBuffers[id].duration,
                loopPoints: this.loopPoints[id] || null
            };
        }
        
        return samples;
    }
    
    /**
     * Clean up resources
     */
    dispose() {
        // Revoke object URLs for videos
        for (const id in this.videoElements) {
            if (this.videoElements[id].src) {
                URL.revokeObjectURL(this.videoElements[id].src);
            }
        }
        
        // Clear all collections
        this.audioBuffers = {};
        this.videoElements = {};
        this.mediaSourceNodes = {};
        this.loopPoints = {};
    }
}

// Export the FileHandler class
export default FileHandler;
