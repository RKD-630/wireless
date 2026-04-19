// --- Core State Management ---
        const state = {
            isConnected: false,
            mode: null, // 'transmitter' | 'receiver'
            isTalking: false,
            audioCtx: null,
            analyser: null,
            stream: null,
            vizInterval: null,
            vizFrame: null,
            oscillator: null,
            gainNode: null,
            noiseFilter: null,
            delayNode: null,
            feedbackNode: null,
            filterNodes: {
                lowShelf: null,
                highShelf: null,
                peaking: null
            },
            volume: 0.8,
            profile: 'normal',
            intensity: 5,
            noiseOff: false,
            peer: null,
            conn: null,
            call: null,
            remoteStream: null
        };

        const DOM = {
            ledConn: document.getElementById('led-conn'),
            ledMode: document.getElementById('led-mode'),
            btnTx: document.getElementById('btn-tx'),
            btnRx: document.getElementById('btn-rx'),
            btnPair: document.getElementById('btn-pair'),
            btnTalk: document.getElementById('btn-talk'),
            talkLabel: document.getElementById('talk-label'),
            talkIcon: document.getElementById('talk-icon'),
            status: document.getElementById('status-msg'),
            viz: document.getElementById('viz'),
            volSlider: document.getElementById('vol-slider'),
            volVal: document.getElementById('volume-val'),
            profileLabel: document.getElementById('active-profile-label'),
            intensityVal: document.getElementById('intensity-val'),
            noiseOffToggle: document.getElementById('noise-off-toggle'),
            localPeerId: document.getElementById('local-peer-id'),
            remotePeerId: document.getElementById('remote-peer-id'),
            connPanel: document.getElementById('connection-panel')
        };

        // Initialize visualizer bars
        for (let i = 0; i < 20; i++) {
            const bar = document.createElement('div');
            bar.className = 'bar';
            DOM.viz.appendChild(bar);
        }

        // --- UI Updates ---
        function updateUI() {
            // LED - Connection
            DOM.ledConn.className = 'led led-conn ' + (state.isConnected ? 'paired' : 'disconnected');
            DOM.btnPair.style.display = state.isConnected ? 'none' : 'flex';

            // LED - Mode
            DOM.ledMode.className = 'led led-mode';
            if (state.mode === 'transmitter') DOM.ledMode.classList.add('tx-active');
            if (state.mode === 'receiver') DOM.ledMode.classList.add('rx-active');

            // Mode Buttons
            DOM.btnTx.classList.toggle('active', state.mode === 'transmitter');
            DOM.btnTx.classList.toggle('tx', state.mode === 'transmitter');
            DOM.btnRx.classList.toggle('active', state.mode === 'receiver');
            DOM.btnRx.classList.toggle('rx', state.mode === 'receiver');

            // Talk Button
            const canTalk = state.isConnected && state.mode;
            DOM.btnTalk.disabled = !canTalk;
            DOM.btnTalk.classList.toggle('ready', canTalk && !state.isTalking);
            DOM.btnTalk.classList.toggle('active', state.isTalking);
            
            DOM.talkLabel.innerText = state.isTalking ? 'Stop' : 'Start Talk';
            DOM.talkIcon.innerText = state.isTalking ? '■' : '▶';

            // Visualizer Reset
            if (!state.isTalking) {
                const bars = DOM.viz.querySelectorAll('.bar');
                bars.forEach(b => {
                    b.style.height = '4px';
                    b.className = 'bar';
                });
            }
        }

        // --- Actions ---
        // --- Actions ---
        function generateShortId() {
            return Math.random().toString(36).substring(2, 8).toUpperCase();
        }

        function initPeer() {
            state.peer = new Peer(generateShortId());
            
            state.peer.on('open', (id) => {
                DOM.localPeerId.innerText = id;
                DOM.status.innerText = "Station Online. Share ID to pair.";
            });

            state.peer.on('connection', (conn) => {
                state.conn = conn;
                setupConnection();
            });

            state.peer.on('call', (call) => {
                state.call = call;
                if (state.mode === 'receiver') {
                    call.answer(); 
                    handleCall(call);
                }
            });

            state.peer.on('error', (err) => {
                console.error("Peer Error:", err);
                DOM.status.innerText = "Link Error: " + err.type;
                if (err.type === 'peer-unavailable') {
                    DOM.btnPair.disabled = false;
                }
            });
        }

        function setupConnection() {
            state.conn.on('open', () => {
                state.isConnected = true;
                DOM.status.innerText = "Link Established!";
                DOM.connPanel.style.display = 'none';
                updateUI();
            });

            state.conn.on('close', () => {
                state.isConnected = false;
                DOM.status.innerText = "Link Terminated.";
                DOM.connPanel.style.display = 'flex';
                updateUI();
            });
        }

        function handleCall(call) {
            call.on('stream', (remoteStream) => {
                state.remoteStream = remoteStream;
                if (state.mode === 'receiver') {
                    DOM.status.innerText = "Receiving Incoming Voice...";
                    initAudioChain(remoteStream);
                    initVisualizer('active-rx');
                }
            });

            call.on('close', () => {
                stopSession();
            });
        }

        async function pairDevice() {
            const remoteId = DOM.remotePeerId.value.trim();
            if (!remoteId) {
                DOM.status.innerText = "Enter Partner Station ID first.";
                return;
            }

            DOM.status.innerText = "Attempting Handshake...";
            DOM.btnPair.disabled = true;

            try {
                state.conn = state.peer.connect(remoteId);
                setupConnection();
            } catch (err) {
                DOM.status.innerText = "Connection Failed.";
                DOM.btnPair.disabled = false;
            }
        }

        function setMode(mode) {
            if (state.isTalking) stopSession();
            
            // Mutually exclusive toggle
            state.mode = (state.mode === mode) ? null : mode;
            
            if (state.mode) {
                DOM.status.innerText = `${mode.toUpperCase()} mode active`;
            } else {
                DOM.status.innerText = "Select a communication mode";
            }
            updateUI();
        }

        function toggleTalk() {
            if (state.isTalking) stopSession();
            else startSession();
        }

        async function startSession() {
            state.isTalking = true;
            updateUI();

            // Handle AudioContext initialization and resume
            try {
                if (!window.isSecureContext) {
                    throw new Error("HTTPS Required for Mic/Bluetooth");
                }
                
                if (!state.audioCtx) {
                    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (state.audioCtx.state === 'suspended') {
                    await state.audioCtx.resume();
                }
            } catch (e) {
                console.error("Context Error:", e);
                DOM.status.innerText = "Error: " + e.message;
                stopSession();
                return;
            }

            if (state.mode === 'transmitter') {
                DOM.status.innerText = "Mic ACTIVE | Transmitting...";
                try {
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        throw new Error("Mic API not supported");
                    }
                    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    initAudioChain(state.stream);
                    initVisualizer('active-tx');

                    // Call the peer if we have a connection
                    if (state.conn && state.conn.peer) {
                        state.call = state.peer.call(state.conn.peer, state.stream);
                    }
                } catch (err) {
                    DOM.status.innerText = "Mic Error: " + (err.name === 'NotAllowedError' ? "Access Denied" : err.message);
                    console.error(err);
                    stopSession();
                }
            } else {
                DOM.status.innerText = "Receiver ACTIVE | Awaiting Voice...";
                // Receiver waits for the 'call' event handled in initPeer
                playTestTone();
            }
        }

        function initAudioChain(stream) {
            if (!state.audioCtx) return;

            // Create nodes
            state.gainNode = state.audioCtx.createGain();
            state.gainNode.gain.setValueAtTime(state.volume, state.audioCtx.currentTime);

            state.noiseFilter = state.audioCtx.createBiquadFilter();
            state.noiseFilter.type = 'highpass';
            state.noiseFilter.frequency.setValueAtTime(20, state.audioCtx.currentTime);

            // Echo Nodes
            state.delayNode = state.audioCtx.createDelay(1.0);
            state.feedbackNode = state.audioCtx.createGain();
            state.delayNode.delayTime.setValueAtTime(0, state.audioCtx.currentTime);
            state.feedbackNode.gain.setValueAtTime(0, state.audioCtx.currentTime);

            // Connect feedback loop
            state.delayNode.connect(state.feedbackNode);
            state.feedbackNode.connect(state.delayNode);

            state.filterNodes.lowShelf = state.audioCtx.createBiquadFilter();
            state.filterNodes.lowShelf.type = 'lowshelf';
            
            state.filterNodes.highShelf = state.audioCtx.createBiquadFilter();
            state.filterNodes.highShelf.type = 'highshelf';

            state.filterNodes.peaking = state.audioCtx.createBiquadFilter();
            state.filterNodes.peaking.type = 'peaking';

            // Apply initial profile
            applyAudioProfile();

            // Connect chain
            state.noiseFilter.connect(state.filterNodes.lowShelf);
            state.noiseFilter.connect(state.delayNode);
            state.delayNode.connect(state.filterNodes.lowShelf);

            state.filterNodes.lowShelf.connect(state.filterNodes.highShelf);
            state.filterNodes.highShelf.connect(state.filterNodes.peaking);
            state.filterNodes.peaking.connect(state.gainNode);
            state.gainNode.connect(state.audioCtx.destination);

            if (stream) {
                const source = state.audioCtx.createMediaStreamSource(stream);
                source.connect(state.noiseFilter);
                
                // Analyser connection
                state.analyser = state.audioCtx.createAnalyser();
                state.analyser.fftSize = 64;
                state.gainNode.connect(state.analyser);
            }
        }

        function updateVolume(val) {
            state.volume = val / 100;
            DOM.volVal.innerText = `${val}%`;
            if (state.gainNode) {
                state.gainNode.gain.setTargetAtTime(state.volume, state.audioCtx.currentTime, 0.05);
            }
        }

        function adjustIntensity(delta) {
            state.intensity = Math.max(1, Math.min(10, state.intensity + delta));
            DOM.intensityVal.innerText = state.intensity;
            applyAudioProfile();
        }

        function toggleNoise(enabled) {
            state.noiseOff = enabled;
            applyAudioProfile();
        }

        function setAudioProfile(profile) {
            state.profile = profile;
            DOM.profileLabel.innerText = profile.toUpperCase();
            applyAudioProfile();
        }

        function applyAudioProfile() {
            if (!state.filterNodes.lowShelf) return;

            const { lowShelf, highShelf, peaking } = state.filterNodes;
            const now = state.audioCtx.currentTime;
            const mult = state.intensity / 5;

            // Reset filters & Echo
            lowShelf.gain.setTargetAtTime(0, now, 0.1);
            highShelf.gain.setTargetAtTime(0, now, 0.1);
            peaking.gain.setTargetAtTime(0, now, 0.1);
            
            if (state.delayNode) state.delayNode.delayTime.setTargetAtTime(0, now, 0.1);
            if (state.feedbackNode) state.feedbackNode.gain.setTargetAtTime(0, now, 0.1);

            // Handle Noise Suppression
            if (state.noiseFilter) {
                state.noiseFilter.frequency.setTargetAtTime(state.noiseOff ? 300 : 20, now, 0.1);
            }

            switch (state.profile) {
                case 'eco':
                    // Echo Effect
                    if (state.delayNode) state.delayNode.delayTime.setTargetAtTime(0.25, now, 0.1);
                    if (state.feedbackNode) state.feedbackNode.gain.setTargetAtTime(0.35 * mult, now, 0.1);
                    
                    // High Clarity EQ
                    lowShelf.frequency.setTargetAtTime(400, now, 0.1);
                    lowShelf.gain.setTargetAtTime(-15 * mult, now, 0.1);
                    highShelf.frequency.setTargetAtTime(3000, now, 0.1);
                    highShelf.gain.setTargetAtTime(-10 * mult, now, 0.1);
                    peaking.frequency.setTargetAtTime(1500, now, 0.1);
                    peaking.gain.setTargetAtTime(12 * mult, now, 0.1);
                    break;
                case 'bass':
                    lowShelf.frequency.setTargetAtTime(200, now, 0.1);
                    lowShelf.gain.setTargetAtTime(12 * mult, now, 0.1);
                    break;
                case 'treble':
                    highShelf.frequency.setTargetAtTime(3000, now, 0.1);
                    highShelf.gain.setTargetAtTime(12 * mult, now, 0.1);
                    break;
                case 'dj':
                    peaking.frequency.setTargetAtTime(1000, now, 0.1);
                    peaking.gain.setTargetAtTime(8 * mult, now, 0.1);
                    peaking.Q.setTargetAtTime(1, now, 0.1);
                    lowShelf.frequency.setTargetAtTime(150, now, 0.1);
                    lowShelf.gain.setTargetAtTime(5 * mult, now, 0.1);
                    break;
                case 'beat':
                    lowShelf.frequency.setTargetAtTime(80, now, 0.1);
                    lowShelf.gain.setTargetAtTime(10 * mult, now, 0.1);
                    highShelf.frequency.setTargetAtTime(5000, now, 0.1);
                    highShelf.gain.setTargetAtTime(6 * mult, now, 0.1);
                    break;
            }
        }

        function playTestTone() {
            if (!state.audioCtx) return;
            const osc = state.audioCtx.createOscillator();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, state.audioCtx.currentTime); 
            
            // Connect to our existing chain instead of directly to destination
            if (state.filterNodes.lowShelf) {
                osc.connect(state.filterNodes.lowShelf);
            } else {
                osc.connect(state.audioCtx.destination);
            }
            
            osc.start();
            osc.stop(state.audioCtx.currentTime + 1.5);
        }

        function stopSession() {
            state.isTalking = false;
            
            // Stop stream
            if (state.stream) {
                state.stream.getTracks().forEach(t => t.stop());
                state.stream = null;
            }

            // Clear visualizers
            if (state.vizInterval) {
                clearInterval(state.vizInterval);
                state.vizInterval = null;
            }
            if (state.vizFrame) {
                cancelAnimationFrame(state.vizFrame);
                state.vizFrame = null;
            }

            // Disconnect nodes
            if (state.gainNode) {
                state.gainNode.disconnect();
                state.gainNode = null;
            }
            if (state.delayNode) {
                state.delayNode.disconnect();
                state.delayNode = null;
            }
            if (state.feedbackNode) {
                state.feedbackNode.disconnect();
                state.feedbackNode = null;
            }
            if (state.analyser) {
                state.analyser.disconnect();
                state.analyser = null;
            }
            Object.values(state.filterNodes).forEach(node => {
                if (node) {
                    node.disconnect();
                }
            });
            state.filterNodes = { lowShelf: null, highShelf: null, peaking: null };
            
            // Close peer call
            if (state.call) {
                state.call.close();
                state.call = null;
            }
            state.remoteStream = null;

            DOM.status.innerText = "Session ended. Ready.";
            updateUI();
        }

        // --- Feedback Animation ---
        function initVisualizer(className, simulate = false) {
            const bars = DOM.viz.querySelectorAll('.bar');
            bars.forEach(b => b.classList.add(className));

            if (simulate) {
                state.vizInterval = setInterval(() => {
                    bars.forEach(b => {
                        const h = 5 + Math.random() * 30;
                        b.style.height = `${h}px`;
                    });
                }, 100);
            } else if (state.stream && state.analyser) {
                // Real mic visualizer logic
                try {
                    const bufferLength = state.analyser.frequencyBinCount;
                    const dataArray = new Uint8Array(bufferLength);

                    const animate = () => {
                        if (!state.isTalking) {
                            state.vizFrame = null;
                            return;
                        }
                        state.analyser.getByteFrequencyData(dataArray);
                        bars.forEach((bar, i) => {
                            const val = dataArray[i % bufferLength] || 0;
                            const h = (val / 255) * 40;
                            bar.style.height = `${Math.max(4, h)}px`;
                        });
                        state.vizFrame = requestAnimationFrame(animate);
                    };
                    state.vizFrame = requestAnimationFrame(animate);
                } catch (e) {
                    // Fallback to simulation if audio context fails
                    initVisualizer(className, true);
                }
            }
        }

        // --- Final Init ---
        initPeer();
        updateUI();