// main.js - Entry point for Web Audio Instrument

// Import modules
import UI from './ui.js';
import FileHandler from './fileHandler.js';
import AudioEngine from './audioEngine.js';
import { FilterEffect, DelayEffect, ReverbEffect, CompressorEffect } from './effects/index.js';

// Main application class
class App {
    constructor() {
        // Initialize audio context (will be created on user interaction)
        this.audioContext = null;

        // Initialize modules (will be properly set up after audio context creation)
        this.ui = new UI();
        this.fileHandler = null;
        this.audioEngine = null;

        // Effect instances
        this.effects = {
            filter: null,
            delay: null,
            reverb: null,
            compressor: null
        };

        // Playback state
        this.isPlaying = false;
        this.currentBPM = 120;
        this.sequencerInterval = null;
        this.currentStep = 0;
        this.totalSteps = 16;

        // Recording state
        this.isRecording = false;
        this.recordedEvents = [];
        this.recordStartTime = 0;

        // Keyboard bindings
        this.keyBindings = {};

        // Initialize the application
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        // Initialize UI
        this.ui.initialize();

        // Set up UI callbacks
        this.setupUICallbacks();

        // Create audio context on user interaction
        document.addEventListener('click', () => this.initAudio(), { once: true });
    }

    /**
     * Initialize audio context and related modules
     */
    initAudio() {
        if (this.audioContext) return;

        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('Audio context initialized');

            // Initialize audio engine
            this.audioEngine = new AudioEngine();
            this.audioEngine.initialize(this.audioContext);

            // Initialize file handler
            this.fileHandler = new FileHandler(this.audioContext);
            this.fileHandler.initialize(this.audioContext);

            // Set up file handler callbacks
            this.setupFileHandlerCallbacks();

            // Create effects
            this.createEffects();

            // Create track editor UI
            this.ui.createTrackEditor();

            console.log('Audio modules initialized');
        } catch (error) {
            console.error('Error initializing audio:', error);
            alert('Failed to initialize audio. Please try again or use a different browser.');
        }
    }

    /**
     * Set up UI callbacks
     */
    setupUICallbacks() {
        // Transport controls
        this.ui.setCallback('onPlay', () => this.togglePlay());
        this.ui.setCallback('onStop', () => this.stopPlayback());
        this.ui.setCallback('onTempoChange', (tempo) => this.updateTempo(tempo));

        // File handling
        this.ui.setCallback('onFilesDrop', (files) => this.handleFiles(files));
        this.ui.setCallback('onFilesSelect', (files) => this.handleFiles(files));
        this.ui.setCallback('onSamplePreview', (sampleId) => this.previewSample(sampleId));

        // Layer controls
        this.ui.setCallback('onSplitLayers', () => this.splitIntoLayers());
        this.ui.setCallback('onLayerSolo', (layerId, isSolo) => this.handleLayerSolo(layerId, isSolo));
        this.ui.setCallback('onLayerMute', (layerId, isMute) => this.handleLayerMute(layerId, isMute));
        this.ui.setCallback('onLayerVolumeChange', (layerId, volume) => this.handleLayerVolumeChange(layerId, volume));

        // Effects controls
        this.ui.setCallback('onFilterChange', (freq) => this.updateFilterFrequency(freq));
        this.ui.setCallback('onReverbChange', (level) => this.updateReverbLevel(level));
        this.ui.setCallback('onDelayChange', (time) => this.updateDelayTime(time));

        // Sequencer controls
        this.ui.setCallback('onSequencerCellToggle', (sampleId, step, isActive) => this.handleSequencerCellToggle(sampleId, step, isActive));
        this.ui.setCallback('onSequencerClear', () => this.clearSequencer());
        this.ui.setCallback('onStepsChange', (steps) => this.changeStepCount(steps));

        // Loop controls
        this.ui.setCallback('onLoopPointsChange', (sampleId, start, end) => this.setLoopPoints(sampleId, start, end));

        // Keyboard binding
        this.ui.setCallback('onKeyBind', (key, sampleId) => this.bindKeyToSample(key, sampleId));
        this.ui.setCallback('onKeyTrigger', (key, sampleId) => this.triggerSample(sampleId));
        this.ui.setCallback('onClearBindings', () => this.clearKeyBindings());

        // Recording
        this.ui.setCallback('onStartRecording', () => this.startRecording());
        this.ui.setCallback('onStopRecording', () => this.stopRecording());

        // Timeline
        this.ui.setCallback('onPlayTimeline', () => this.playTimeline());
        this.ui.setCallback('onClearTimeline', () => this.clearTimeline());
        this.ui.setCallback('onExportTimeline', () => this.exportTimeline());
        this.ui.setCallback('onClipEdit', (clip) => this.updateClip(clip));
    }

    /**
     * Set up file handler callbacks
     */
    setupFileHandlerCallbacks() {
        this.fileHandler.onFileLoaded = (result) => {
            console.log('File loaded:', result);

            // Add to UI
            this.ui.addSampleToList(result.id, result.file.name, result.type);
            this.ui.addSampleRow(result.id, result.file.name);

            // If it's a video, set up video player
            if (result.type === 'video' && result.videoElement) {
                this.ui.loadVideoPlayer(result.id, result.videoElement, this.fileHandler.getLoopPoints(result.id));
            }
        };

        this.fileHandler.onFileLoadError = (error) => {
            console.error('File load error:', error);
            alert(`Error loading file: ${error.file.name}\n${error.error.message}`);
        };

        this.fileHandler.onAllFilesProcessed = (results) => {
            console.log('All files processed:', results);
        };
    }

    /**
     * Create audio effects
     */
    createEffects() {
        // Create filter effect
        this.effects.filter = new FilterEffect(this.audioContext);

        // Create delay effect
        this.effects.delay = new DelayEffect(this.audioContext);

        // Create reverb effect
        this.effects.reverb = new ReverbEffect(this.audioContext);

        // Create compressor effect
        this.effects.compressor = new CompressorEffect(this.audioContext);

        // Connect effects chain
        // Source -> Filter -> Delay -> Reverb -> Compressor -> Destination
        const destination = this.audioEngine.getMasterGain();

        this.effects.compressor.connect(this.audioEngine.getAnalyser(), destination);
        this.effects.reverb.connect(this.audioEngine.getAnalyser(), this.effects.compressor.getNode());
        this.effects.delay.connect(this.audioEngine.getAnalyser(), this.effects.reverb.getInputNode());
        this.effects.filter.connect(this.audioEngine.getAnalyser(), this.effects.delay.getInputNode());
    }

    /**
     * Handle files from drop or file input
     * @param {FileList} files - The files to process
     */
    async handleFiles(files) {
        if (!this.audioContext) {
            this.initAudio();
        }

        await this.fileHandler.processFiles(files);
    }

    /**
     * Toggle play/pause
     */
    togglePlay() {
        this.isPlaying = !this.isPlaying;

        if (this.isPlaying) {
            this.startPlayback();
        } else {
            this.pausePlayback();
        }
    }

    /**
     * Start playback
     */
    startPlayback() {
        if (!this.audioContext) {
            this.initAudio();
        }

        // Resume audio context if it's suspended
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // Calculate interval based on tempo
        const intervalTime = (60 / this.currentBPM) * 1000 / 4; // 16th notes

        // Start sequencer
        this.currentStep = 0;
        this.sequencerInterval = setInterval(() => this.playNextStep(), intervalTime);
    }

    /**
     * Play the next sequencer step
     */
    playNextStep() {
        // Update UI to highlight current step
        const stepCells = this.ui.updateCurrentStep(this.currentStep);

        // Play active cells
        stepCells.forEach(cell => {
            if (cell.classList.contains('active')) {
                const sampleId = cell.dataset.sample;
                this.playSample(sampleId);

                // Record the event if recording
                if (this.isRecording) {
                    this.recordEvent({
                        type: 'sequencer',
                        sampleId: sampleId,
                        time: (performance.now() - this.recordStartTime) / 1000,
                        duration: 0.25 // Default duration for sequencer events
                    });
                }
            }
        });

        // Move to next step
        this.currentStep = (this.currentStep + 1) % this.totalSteps;
    }

    /**
     * Pause playback
     */
    pausePlayback() {
        clearInterval(this.sequencerInterval);
    }

    /**
     * Stop playback
     */
    stopPlayback() {
        clearInterval(this.sequencerInterval);
        this.isPlaying = false;
        this.currentStep = 0;

        // Stop all active sources
        this.audioEngine.stopAllSources();

        // Remove current-step highlighting
        this.ui.updateCurrentStep(-1);
    }

    /**
     * Update tempo
     * @param {number} tempo - The new tempo in BPM
     */
    updateTempo(tempo) {
        this.currentBPM = tempo;

        // Update sequencer timing if playing
        if (this.isPlaying) {
            this.pausePlayback();
            this.startPlayback();
        }
    }

    /**
     * Preview a sample
     * @param {string} sampleId - The sample ID to preview
     */
    previewSample(sampleId) {
        if (!this.audioContext) {
            this.initAudio();
        }

        // Check if it's a video sample
        if (this.fileHandler.videoElements[sampleId]) {
            // Play video
            this.fileHandler.playVideoSample(sampleId);

            // Load video into player
            this.ui.loadVideoPlayer(
                sampleId,
                this.fileHandler.videoElements[sampleId],
                this.fileHandler.getLoopPoints(sampleId)
            );
        } else {
            // Play audio sample
            this.playSample(sampleId);
        }
    }

    /**
     * Play a sample
     * @param {string} sampleId - The sample ID to play
     */
    playSample(sampleId) {
        if (!this.audioContext || !this.fileHandler.audioBuffers[sampleId]) return;

        // Create source node
        const source = this.audioContext.createBufferSource();
        source.buffer = this.fileHandler.audioBuffers[sampleId];

        // Get loop points
        const loopPoints = this.fileHandler.getLoopPoints(sampleId);
        if (loopPoints) {
            source.loop = true;
            source.loopStart = loopPoints.start;
            source.loopEnd = loopPoints.end;
        }

        // Connect to effects chain
        source.connect(this.effects.filter.getNode());

        // Start playback
        source.start(0);

        // Store source for potential stopping
        this.audioEngine.addActiveSource(sampleId, source);
    }

    /**
     * Split audio into frequency layers
     */
    splitIntoLayers() {
        // This is a placeholder for actual layer splitting
        // In a real implementation, this would use more sophisticated DSP techniques
        console.log('Splitting into layers');
    }

    /**
     * Handle layer solo button click
     * @param {string} layerId - The layer ID
     * @param {boolean} isSolo - Whether the layer is soloed
     */
    handleLayerSolo(layerId, isSolo) {
        this.audioEngine.setLayerSolo(layerId, isSolo);
    }

    /**
     * Handle layer mute button click
     * @param {string} layerId - The layer ID
     * @param {boolean} isMute - Whether the layer is muted
     */
    handleLayerMute(layerId, isMute) {
        this.audioEngine.setLayerMute(layerId, isMute);
    }

    /**
     * Handle layer volume change
     * @param {string} layerId - The layer ID
     * @param {number} volume - The new volume (0-1)
     */
    handleLayerVolumeChange(layerId, volume) {
        this.audioEngine.setLayerVolume(layerId, volume);
    }

    /**
     * Update filter frequency
     * @param {number} freq - The frequency in Hz
     */
    updateFilterFrequency(freq) {
        if (this.effects.filter) {
            this.effects.filter.setFrequency(freq);
        }
    }

    /**
     * Update reverb level
     * @param {number} level - The reverb level (0-1)
     */
    updateReverbLevel(level) {
        if (this.effects.reverb) {
            this.effects.reverb.setMix(level);
        }
    }

    /**
     * Update delay time
     * @param {number} time - The delay time in seconds
     */
    updateDelayTime(time) {
        if (this.effects.delay) {
            this.effects.delay.setDelayTime(time);
        }
    }

    /**
     * Handle sequencer cell toggle
     * @param {string} sampleId - The sample ID
     * @param {number} step - The step number
     * @param {boolean} isActive - Whether the cell is active
     */
    handleSequencerCellToggle(sampleId, step, isActive) {
        console.log(`Sequencer cell toggled: ${sampleId}, step ${step}, active: ${isActive}`);
    }

    /**
     * Clear sequencer pattern
     */
    clearSequencer() {
        console.log('Sequencer cleared');
    }

    /**
     * Change number of steps in sequencer
     * @param {number} steps - The number of steps
     */
    changeStepCount(steps) {
        this.totalSteps = steps;
        this.currentStep = 0;

        // Update sequencer timing if playing
        if (this.isPlaying) {
            this.pausePlayback();
            this.startPlayback();
        }
    }

    /**
     * Set loop points for a sample
     * @param {string} sampleId - The sample ID
     * @param {number} start - The loop start time in seconds
     * @param {number} end - The loop end time in seconds
     */
    setLoopPoints(sampleId, start, end) {
        if (this.fileHandler) {
            try {
                this.fileHandler.setLoopPoints(sampleId, start, end);
                console.log(`Loop points set for ${sampleId}: ${start}s - ${end}s`);
            } catch (error) {
                console.error('Error setting loop points:', error);
            }
        }
    }

    /**
     * Bind a key to a sample
     * @param {string} key - The key to bind
     * @param {string} sampleId - The sample ID to bind to the key
     */
    bindKeyToSample(key, sampleId) {
        this.keyBindings[key] = sampleId;
        console.log(`Bound key ${key} to sample ${sampleId}`);
    }

    /**
     * Trigger a sample by key
     * @param {string} sampleId - The sample ID to trigger
     */
    triggerSample(sampleId) {
        this.playSample(sampleId);

        // Record the event if recording
        if (this.isRecording) {
            this.recordEvent({
                type: 'keyboard',
                sampleId: sampleId,
                time: (performance.now() - this.recordStartTime) / 1000,
                duration: 0.5 // Default duration for keyboard events
            });
        }
    }

    /**
     * Clear all key bindings
     */
    clearKeyBindings() {
        this.keyBindings = {};
        console.log('All key bindings cleared');
    }

    /**
     * Start recording
     */
    startRecording() {
        this.isRecording = true;
        this.recordedEvents = [];
        this.recordStartTime = performance.now();
        console.log('Recording started');
    }

    /**
     * Stop recording
     */
    stopRecording() {
        this.isRecording = false;
        console.log('Recording stopped');
        console.log('Recorded events:', this.recordedEvents);

        // Add recorded events to timeline
        this.recordedEvents.forEach(event => {
            this.ui.addRecordedEvent(event);
        });
    }

    /**
     * Record an event
     * @param {Object} event - The event to record
     */
    recordEvent(event) {
        this.recordedEvents.push(event);
    }

    /**
     * Play the timeline
     */
    playTimeline() {
        console.log('Playing timeline');

        // Get all clips from the timeline
        const clips = document.querySelectorAll('.clip');

        // Schedule each clip to play at its time
        clips.forEach(clip => {
            const sampleId = clip.dataset.sampleId;
            const time = parseFloat(clip.dataset.time);

            // Schedule playback
            setTimeout(() => {
                this.playSample(sampleId);
            }, time * 1000);
        });
    }

    /**
     * Clear the timeline
     */
    clearTimeline() {
        this.recordedEvents = [];
        console.log('Timeline cleared');
    }

    /**
     * Export the timeline
     */
    exportTimeline() {
        // Create a JSON representation of the timeline
        const clips = document.querySelectorAll('.clip');
        const timelineData = Array.from(clips).map(clip => ({
            sampleId: clip.dataset.sampleId,
            time: parseFloat(clip.dataset.time),
            duration: parseFloat(clip.dataset.duration)
        }));

        // Create a JSON blob
        const blob = new Blob([JSON.stringify(timelineData, null, 2)], { type: 'application/json' });

        // Create a download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'timeline.json';
        document.body.appendChild(a);
        a.click();

        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);

        console.log('Timeline exported');
    }

    /**
     * Update a clip in the timeline
     * @param {Object} clip - The clip data
     */
    updateClip(clip) {
        console.log('Clip updated:', clip);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
});