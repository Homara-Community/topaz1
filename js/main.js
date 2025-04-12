// main.js - Entry point for Web Audio Instrument

// Import modules
import UI from './ui.js';
import FileHandler from './fileHandler.js';
import AudioEngine from './audioEngine.js';
import { FilterEffect, DelayEffect, ReverbEffect, CompressorEffect } from './effects/index.js';
import SongDissector from './dissector/index.js';

// Main application class
class App {
    constructor() {
        // Initialize audio context (will be created on user interaction)
        this.audioContext = null;

        // Initialize modules (will be properly set up after audio context creation)
        this.ui = new UI();
        this.fileHandler = null;
        this.audioEngine = null;
        this.songDissector = null;

        // Effect instances
        this.effects = {
            filter: null,
            delay: null,
            reverb: null,
            compressor: null
        };

        // Song dissector state
        this.dissectorFile = null;
        this.extractedComponents = [];

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

            // Initialize song dissector
            this.songDissector = new SongDissector(this.audioContext);
            this.songDissector.initialize(this.audioContext);

            // Set up file handler callbacks
            this.setupFileHandlerCallbacks();

            // Set up song dissector callbacks
            this.setupDissectorCallbacks();

            // Create effects
            this.createEffects();

            // Create track editor UI
            this.ui.createTrackEditor();

            // Set up additional UI event listeners
            this.setupAdditionalUIListeners();

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

    /**
     * Set up song dissector callbacks
     */
    setupDissectorCallbacks() {
        if (!this.songDissector) return;

        // Progress update callback
        this.songDissector.onProgressUpdate = (progress) => {
            // Update progress bar
            const progressFill = document.querySelector('.progress-fill');
            if (progressFill) {
                progressFill.style.width = `${progress}%`;
            }
        };

        // Dissection complete callback
        this.songDissector.onDissectionComplete = (components) => {
            console.log('Dissection complete:', components);
            this.extractedComponents = components;

            // Show results
            const dissectionProgress = document.getElementById('dissectionProgress');
            const dissectionResults = document.getElementById('dissectionResults');
            const componentsList = document.getElementById('componentsList');

            if (dissectionProgress) dissectionProgress.classList.add('hidden');
            if (dissectionResults) dissectionResults.classList.remove('hidden');

            // Clear previous results
            if (componentsList) componentsList.innerHTML = '';

            // Add components to the list
            components.forEach(component => {
                const listItem = document.createElement('li');
                listItem.innerHTML = `
                    <span>${component.name}</span>
                    <div>
                        <button class="preview-btn" data-component-id="${component.id}">Preview</button>
                        <button class="add-to-track-btn" data-component-id="${component.id}">Add to Track</button>
                    </div>
                `;

                componentsList.appendChild(listItem);

                // Add event listeners
                const previewBtn = listItem.querySelector('.preview-btn');
                const addToTrackBtn = listItem.querySelector('.add-to-track-btn');

                previewBtn.addEventListener('click', () => this.previewComponent(component.id));
                addToTrackBtn.addEventListener('click', () => this.addComponentToTrack(component.id));
            });

            // Enable dissect button
            const dissectBtn = document.getElementById('dissectBtn');
            if (dissectBtn) dissectBtn.disabled = false;
        };

        // Dissection error callback
        this.songDissector.onDissectionError = (error) => {
            console.error('Dissection error:', error);

            // Show error message
            alert(`Error dissecting song: ${error.message}`);

            // Hide progress
            const dissectionProgress = document.getElementById('dissectionProgress');
            if (dissectionProgress) dissectionProgress.classList.add('hidden');

            // Enable dissect button
            const dissectBtn = document.getElementById('dissectBtn');
            if (dissectBtn) dissectBtn.disabled = false;
        };
    }

    /**
     * Set up additional UI event listeners
     */
    setupAdditionalUIListeners() {
        // Song dissector dropzone
        const dissectorDropZone = document.getElementById('dissectorDropZone');
        const dissectorFileInput = document.getElementById('dissectorFileInput');
        const dissectBtn = document.getElementById('dissectBtn');

        if (dissectorDropZone) {
            dissectorDropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dissectorDropZone.classList.add('dragover');
            });

            dissectorDropZone.addEventListener('dragleave', () => {
                dissectorDropZone.classList.remove('dragover');
            });

            dissectorDropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dissectorDropZone.classList.remove('dragover');

                const files = e.dataTransfer.files;
                if (files.length > 0 && files[0].type === 'video/mp4') {
                    this.handleDissectorFile(files[0]);
                } else {
                    alert('Please drop an MP4 file.');
                }
            });
        }

        if (dissectorFileInput) {
            dissectorFileInput.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files.length > 0 && files[0].type === 'video/mp4') {
                    this.handleDissectorFile(files[0]);
                } else {
                    alert('Please select an MP4 file.');
                }
            });
        }

        if (dissectBtn) {
            dissectBtn.addEventListener('click', () => this.dissectSong());
        }

        // Add track button
        const addTrackBtn = document.getElementById('addTrackBtn');
        if (addTrackBtn) {
            addTrackBtn.addEventListener('click', () => this.addNewTrack());
        }
    }

    /**
     * Handle a file selected for the song dissector
     * @param {File} file - The MP4 file
     */
    handleDissectorFile(file) {
        if (!this.audioContext) {
            this.initAudio();
        }

        this.dissectorFile = file;

        // Update UI
        const dissectBtn = document.getElementById('dissectBtn');
        if (dissectBtn) {
            dissectBtn.disabled = false;
            dissectBtn.textContent = `Dissect ${file.name}`;
        }

        // Hide previous results
        const dissectionResults = document.getElementById('dissectionResults');
        if (dissectionResults) dissectionResults.classList.add('hidden');
    }

    /**
     * Start the song dissection process
     */
    dissectSong() {
        if (!this.dissectorFile || !this.songDissector) return;

        // Disable dissect button
        const dissectBtn = document.getElementById('dissectBtn');
        if (dissectBtn) dissectBtn.disabled = true;

        // Show progress
        const dissectionProgress = document.getElementById('dissectionProgress');
        if (dissectionProgress) dissectionProgress.classList.remove('hidden');

        // Reset progress bar
        const progressFill = document.querySelector('.progress-fill');
        if (progressFill) progressFill.style.width = '0%';

        // Start dissection
        this.songDissector.processFile(this.dissectorFile)
            .catch(error => {
                console.error('Error in dissection process:', error);
            });
    }

    /**
     * Preview a component
     * @param {string} componentId - The component ID
     */
    previewComponent(componentId) {
        const component = this.extractedComponents.find(c => c.id === componentId);
        if (!component) return;

        // Create a source node
        const source = this.audioContext.createBufferSource();
        source.buffer = component.buffer;

        // Connect to effects chain
        source.connect(this.effects.filter.getNode());

        // Start playback
        source.start(0);

        // Store source for potential stopping
        this.audioEngine.addActiveSource(`component-${componentId}`, source);
    }

    /**
     * Add a component to the track editor
     * @param {string} componentId - The component ID
     */
    addComponentToTrack(componentId) {
        const component = this.extractedComponents.find(c => c.id === componentId);
        if (!component) return;

        // Find the first available track
        const tracks = document.querySelectorAll('.track');
        if (tracks.length === 0) return;

        const track = tracks[0];

        // Create a clip
        const clip = document.createElement('div');
        clip.className = 'clip';
        clip.style.left = '10px';
        clip.style.width = '100px';
        clip.dataset.time = 0;
        clip.dataset.duration = 2;
        clip.dataset.componentId = componentId;

        // Add clip content
        clip.innerHTML = `
            <div class="clip-handle left"></div>
            <div class="clip-content">${component.name}</div>
            <div class="clip-handle right"></div>
        `;

        track.appendChild(clip);

        // Make clip interactive
        this.makeClipInteractive(clip);
    }

    /**
     * Make a clip interactive (draggable and resizable)
     * @param {HTMLElement} clip - The clip element
     */
    makeClipInteractive(clip) {
        let isDragging = false;
        let isResizingLeft = false;
        let isResizingRight = false;
        let startX = 0;
        let startLeft = 0;
        let startWidth = 0;

        const leftHandle = clip.querySelector('.clip-handle.left');
        const rightHandle = clip.querySelector('.clip-handle.right');

        // Left resize handle
        leftHandle.addEventListener('mousedown', (e) => {
            isResizingLeft = true;
            startX = e.clientX;
            startLeft = parseInt(clip.style.left) || 0;
            startWidth = parseInt(clip.style.width) || 0;
            e.stopPropagation();
        });

        // Right resize handle
        rightHandle.addEventListener('mousedown', (e) => {
            isResizingRight = true;
            startX = e.clientX;
            startWidth = parseInt(clip.style.width) || 0;
            e.stopPropagation();
        });

        // Clip dragging
        clip.addEventListener('mousedown', (e) => {
            if (!isResizingLeft && !isResizingRight) {
                isDragging = true;
                startX = e.clientX;
                startLeft = parseInt(clip.style.left) || 0;
            }
        });

        // Mouse move handler
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const dx = e.clientX - startX;
                clip.style.left = `${Math.max(0, startLeft + dx)}px`;
            } else if (isResizingLeft) {
                const dx = e.clientX - startX;
                const newLeft = Math.max(0, startLeft + dx);
                const newWidth = Math.max(10, startWidth - dx);

                clip.style.left = `${newLeft}px`;
                clip.style.width = `${newWidth}px`;
            } else if (isResizingRight) {
                const dx = e.clientX - startX;
                clip.style.width = `${Math.max(10, startWidth + dx)}px`;
            }
        });

        // Mouse up handler
        document.addEventListener('mouseup', () => {
            if (isDragging || isResizingLeft || isResizingRight) {
                // Update clip data attributes
                clip.dataset.time = parseInt(clip.style.left) / 100;
                clip.dataset.duration = parseInt(clip.style.width) / 100;
            }

            isDragging = false;
            isResizingLeft = false;
            isResizingRight = false;
        });
    }

    /**
     * Add a new track to the track editor
     */
    addNewTrack() {
        const trackLabels = document.querySelector('.track-labels');
        const trackContent = document.querySelector('.track-content');

        if (!trackLabels || !trackContent) return;

        // Get the next track number
        const trackCount = trackLabels.children.length + 1;

        // Create track label
        const trackLabel = document.createElement('div');
        trackLabel.className = 'track-label';
        trackLabel.textContent = `Track ${trackCount}`;
        trackLabels.appendChild(trackLabel);

        // Create track
        const track = document.createElement('div');
        track.className = 'track';
        track.dataset.track = trackCount;
        trackContent.appendChild(track);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
});