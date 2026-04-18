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
            filterNodes: {
                lowShelf: null,
                highShelf: null,
                peaking: null
            },
            volume: 0.8,
            profile: 'normal',
            peer: null,
            remotePeerId: null,
            activeCall: null
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
            myId: document.getElementById('my-id'),
            targetId: document.getElementById('target-id'),
            qrcode: document.getElementById('qrcode'),
            scannerModal: document.getElementById('scanner-modal')
        };

        let scanner = null;

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
            const canTalk = state.isConnected && state.mode === 'transmitter';
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

        // --- P2P Networking ---
        function initPeer() {
            state.peer = new Peer({
                host: '0.peerjs.com',
                port: 443,
                secure: true,
                debug: 1
            });

            state.peer.on('open', (id) => {
                DOM.myId.innerText = id;
                DOM.status.innerText = "Network Ready. Share your ID.";
                generateQRCode(id);
            });

            state.peer.on('error', (err) => {
                console.error("PeerJS Error:", err);
                DOM.status.innerText = "Network Error: " + err.type;
            });

            state.peer.on('call', async (call) => {
                DOM.status.innerText = "Incoming Voice Call...";
                state.isConnected = true;
                state.mode = 'receiver';
                state.activeCall = call;
                
                call.answer(); 
                
                call.on('stream', (remoteStream) => {
                    DOM.status.innerText = "Receiving Audio...";
                    state.isTalking = true;
                    initAudioChain(remoteStream);
                    initVisualizer('active-rx');
                    updateUI();
                });

                call.on('close', stopSession);
                updateUI();
            });
        }

        function copyMyId() {
            const id = DOM.myId.innerText;
            if (id === '---') return;
            navigator.clipboard.writeText(id);
            DOM.status.innerText = "ID Copied to clipboard!";
            setTimeout(() => DOM.status.innerText = "Network Ready.", 2000);
        }

        function generateQRCode(id) {
            DOM.qrcode.innerHTML = "";
            DOM.qrcode.style.display = "block";
            new QRCode(DOM.qrcode, {
                text: id,
                width: 140,
                height: 140,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
        }

        async function startScanner() {
            DOM.scannerModal.style.display = "flex";
            scanner = new Html5Qrcode("reader");
            
            try {
                const config = { fps: 10, qrbox: { width: 250, height: 250 } };
                await scanner.start({ facingMode: "environment" }, config, (decodedText) => {
                    DOM.targetId.value = decodedText;
                    stopScanner();
                    pairDevice();
                });
            } catch (err) {
                console.error("Scanner Error:", err);
                DOM.status.innerText = "Scanner Error: " + err;
                stopScanner();
            }
        }

        async function stopScanner() {
            try {
                if (scanner) {
                    await scanner.stop();
                }
            } catch (err) {
                console.warn("Scanner stop error:", err);
            } finally {
                scanner = null;
                DOM.scannerModal.style.display = "none";
            }
        }

        async function pairDevice() {
            const target = DOM.targetId.value.trim();
            if (!target) {
                DOM.status.innerText = "Enter a valid Remote ID";
                return;
            }

            DOM.status.innerText = "Connecting to " + target + "...";
            DOM.btnPair.disabled = true;

            state.remotePeerId = target;
            state.isConnected = true;
            DOM.status.innerText = "Linked to Remote Peer";
            DOM.btnPair.disabled = false;
            updateUI();
        }

        function setMode(mode) {
            if (state.isTalking) stopSession();
            
            state.mode = (state.mode === mode) ? null : mode;
            
            if (state.mode) {
                DOM.status.innerText = `${mode.toUpperCase()} mode active`;
                if (mode === 'receiver') {
                    DOM.status.innerText += " | Waiting for remote voice...";
                }
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
            if (!state.audioCtx) {
                state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (state.audioCtx.state === 'suspended') {
                await state.audioCtx.resume();
            }

            if (state.mode === 'transmitter') {
                DOM.status.innerText = "Capturing Mic...";
                try {
                    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    
                    // Initialize chain and process locally for feedback
                    initAudioChain(state.stream);
                    
                    // Establish real WebRTC call
                    if (state.remotePeerId) {
                        // Create a destination node to capture processed audio
                        const dest = state.audioCtx.createMediaStreamDestination();
                        state.gainNode.connect(dest);
                        
                        state.activeCall = state.peer.call(state.remotePeerId, dest.stream);
                        DOM.status.innerText = "Transmitting Voice...";
                    }
                    
                    state.isTalking = true;
                    initVisualizer('active-tx');
                } catch (err) {
                    DOM.status.innerText = "Mic Error: " + err.message;
                    stopSession();
                }
            }
            updateUI();
        }

        function initAudioChain(stream) {
            if (!state.audioCtx) return;

            // Create nodes
            state.gainNode = state.audioCtx.createGain();
            state.gainNode.gain.setValueAtTime(state.volume, state.audioCtx.currentTime);

            state.filterNodes.lowShelf = state.audioCtx.createBiquadFilter();
            state.filterNodes.lowShelf.type = 'lowshelf';
            
            state.filterNodes.highShelf = state.audioCtx.createBiquadFilter();
            state.filterNodes.highShelf.type = 'highshelf';

            state.filterNodes.peaking = state.audioCtx.createBiquadFilter();
            state.filterNodes.peaking.type = 'peaking';

            // Apply initial profile
            applyAudioProfile();

            // Connect chain
            state.filterNodes.lowShelf.connect(state.filterNodes.highShelf);
            state.filterNodes.highShelf.connect(state.filterNodes.peaking);
            state.filterNodes.peaking.connect(state.gainNode);
            state.gainNode.connect(state.audioCtx.destination);

            if (stream) {
                const source = state.audioCtx.createMediaStreamSource(stream);
                source.connect(state.filterNodes.lowShelf);
                
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

        function setAudioProfile(profile) {
            state.profile = profile;
            DOM.profileLabel.innerText = profile.toUpperCase();
            applyAudioProfile();
        }

        function applyAudioProfile() {
            if (!state.filterNodes.lowShelf) return;

            const { lowShelf, highShelf, peaking } = state.filterNodes;
            const now = state.audioCtx.currentTime;

            // Reset filters
            lowShelf.gain.setTargetAtTime(0, now, 0.1);
            highShelf.gain.setTargetAtTime(0, now, 0.1);
            peaking.gain.setTargetAtTime(0, now, 0.1);

            switch (state.profile) {
                case 'eco':
                    // Vocal bandwidth optimization (300Hz - 3400Hz)
                    lowShelf.frequency.setTargetAtTime(300, now, 0.1);
                    lowShelf.gain.setTargetAtTime(-10, now, 0.1);
                    highShelf.frequency.setTargetAtTime(3400, now, 0.1);
                    highShelf.gain.setTargetAtTime(-10, now, 0.1);
                    peaking.frequency.setTargetAtTime(1500, now, 0.1);
                    peaking.gain.setTargetAtTime(6, now, 0.1);
                    break;
                case 'bass':
                    lowShelf.frequency.setTargetAtTime(200, now, 0.1);
                    lowShelf.gain.setTargetAtTime(12, now, 0.1);
                    break;
                case 'treble':
                    highShelf.frequency.setTargetAtTime(3000, now, 0.1);
                    highShelf.gain.setTargetAtTime(12, now, 0.1);
                    break;
                case 'dj':
                    peaking.frequency.setTargetAtTime(1000, now, 0.1);
                    peaking.gain.setTargetAtTime(8, now, 0.1);
                    peaking.Q.setTargetAtTime(1, now, 0.1);
                    lowShelf.frequency.setTargetAtTime(150, now, 0.1);
                    lowShelf.gain.setTargetAtTime(5, now, 0.1);
                    break;
                case 'beat':
                    lowShelf.frequency.setTargetAtTime(80, now, 0.1);
                    lowShelf.gain.setTargetAtTime(10, now, 0.1);
                    highShelf.frequency.setTargetAtTime(5000, now, 0.1);
                    highShelf.gain.setTargetAtTime(6, now, 0.1);
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

            if (state.activeCall) {
                state.activeCall.close();
                state.activeCall = null;
            }
            
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