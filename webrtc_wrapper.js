console.log("webrtc_wrapper.js loaded!");
let hostId = null;
try {
    const query = window.location.search.substring(1);
    const vars = query.split('&');
    for (let i = 0; i < vars.length; i++) {
        let pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) == 'host') {
            hostId = decodeURIComponent(pair[1]);
            break;
        }
    }
} catch (e) {
    console.error("Query string parse error:", e);
}
const isHost = !hostId;
console.log("isHost=", isHost, "hostId=", hostId);

const socket = {
    events: {},
    on: function(ev, cb) { if(!this.events[ev]) this.events[ev] = []; this.events[ev].push(cb); },
    emit: function(ev, data) {
        if (isHost) {
            handleHostEvent(ev, data, 0); // 0 = Host
        } else {
            if (guestConn && guestConn.open) {
                guestConn.send({ type: 'client_event', event: ev, data: data });
            }
        }
    },
    trigger: function(ev, data) {
        if (this.events[ev]) this.events[ev].forEach(cb => cb(data));
    }
};

let srvBoard = [6, 6, 6, 6, 6, 6, 0, 6, 6, 6, 6, 6, 6, 0];
let srvCurrentPlayer = 0;
let srvPlayerNames = ["Spieler 1", "Spieler 2"];
let srvRestartRequests = [false, false];
let srvActivePlayers = 1;

let guestConn = null;
console.log("Initializing PeerJS...");
let peer;
try {
    peer = new Peer();
    console.log("PeerJS new instance created.");
} catch (e) {
    console.error("Peer init err:", e);
}

peer.on('open', (id) => {
    console.log("Peer connected to server! ID:", id);
    if (isHost) {
        console.log("Executing Host Initialization...");
        try {
            const qrcodeContainer = document.getElementById('qrcode-container');
            qrcodeContainer.style.display = 'block';
            console.log("Creating QRCode...");
            new QRCode(document.getElementById('qrcode'), {
                text: `https://ermuraten.github.io/mancala-kalaha/?host=${id}`,
                width: 250, height: 250
            });
            console.log("QRCode created!");
        } catch(e) {
            console.error("QR Code Error:", e);
        }
        
        setTimeout(() => {
            console.log("Triggering local game initialization for Host...");
            socket.trigger('init', { playerIndex: 0, playerNames: srvPlayerNames });
            socket.trigger('playerStatus', { playerCount: 1, playerNames: srvPlayerNames });
            socket.trigger('syncBoard', { board: srvBoard, currentPlayer: srvCurrentPlayer });
        }, 100);

    } else {
        document.getElementById('status').innerText = "Verbinde mit Fernseher...";
        guestConn = peer.connect(hostId);
        
        guestConn.on('open', () => {
            document.getElementById('status').innerText = "Verbunden! Warte auf Spielbrett...";
        });
        
        guestConn.on('data', (payload) => {
            if (payload.type === 'server_event') {
                socket.trigger(payload.event, payload.data);
            }
        });
        
        guestConn.on('close', () => {
            document.getElementById('status').innerText = "Verbindung zum Fernseher verloren!";
        });
    }
});

peer.on('error', (err) => {
    console.error("PeerJS ERROR Event:", err.type, err.message || err);
});

if (isHost) {
    function broadcast(event, data) {
        socket.trigger(event, data);
        if (guestConn && guestConn.open) {
            guestConn.send({ type: 'server_event', event: event, data: data });
        }
    }

    function handleHostEvent(event, data, playerIndex) {
        if (event === 'makeMove') {
            let pitIndex = data;
            if (playerIndex !== srvCurrentPlayer || playerIndex === -1) return;
            if (srvBoard[pitIndex] === 0) return;
            if (playerIndex === 0 && (pitIndex < 0 || pitIndex > 5)) return;
            if (playerIndex === 1 && (pitIndex < 7 || pitIndex > 12)) return;

            let stones = srvBoard[pitIndex];
            srvBoard[pitIndex] = 0;
            let currentIndex = pitIndex;
            let animationPath = [];

            while (stones > 0) {
                currentIndex = (currentIndex + 1) % 14;
                if ((playerIndex === 0 && currentIndex === 13) || (playerIndex === 1 && currentIndex === 6)) continue;
                srvBoard[currentIndex]++;
                stones--;
                animationPath.push(currentIndex);
            }

            let freeTurn = false;
            let captureInfo = null;

            if ((playerIndex === 0 && currentIndex === 6) || (playerIndex === 1 && currentIndex === 13)) {
                freeTurn = true;
            } else {
                let isOwnSide = (playerIndex === 0 && currentIndex >= 0 && currentIndex <= 5) ||
                                (playerIndex === 1 && currentIndex >= 7 && currentIndex <= 12);
                if (isOwnSide && srvBoard[currentIndex] === 1) {
                    let oppositeIndex = 12 - currentIndex;
                    if (srvBoard[oppositeIndex] > 0) {
                        let capturedStones = srvBoard[oppositeIndex] + 1;
                        srvBoard[currentIndex] = 0;
                        srvBoard[oppositeIndex] = 0;
                        let myKalaha = playerIndex === 0 ? 6 : 13;
                        srvBoard[myKalaha] += capturedStones;
                        captureInfo = { fromPit: oppositeIndex, ownPit: currentIndex, toKalaha: myKalaha };
                    }
                }
            }

            let gameOver = false;
            let p1Empty = true, p2Empty = true;
            for (let i=0; i<6; i++) if (srvBoard[i]>0) p1Empty=false;
            for (let i=7; i<13; i++) if (srvBoard[i]>0) p2Empty=false;
            if (p1Empty || p2Empty) {
                for (let i=0; i<6; i++) { srvBoard[6]+=srvBoard[i]; srvBoard[i]=0; }
                for (let i=7; i<13; i++) { srvBoard[13]+=srvBoard[i]; srvBoard[i]=0; }
                gameOver = true;
            }

            if (gameOver) {
                srvCurrentPlayer = -1;
            } else if (!freeTurn) {
                srvCurrentPlayer = srvCurrentPlayer === 0 ? 1 : 0;
            }

            broadcast('animateMove', {
                startPit: pitIndex, path: animationPath, capture: captureInfo,
                finalBoard: srvBoard, nextPlayer: srvCurrentPlayer, gameOver: gameOver, freeTurn: freeTurn
            });
        }
        else if (event === 'chatMessage') {
            let senderName = srvPlayerNames[playerIndex];
            broadcast('chatMessage', { id: playerIndex === 0 ? 'host' : 'guest', text: data, playerIndex: playerIndex, senderName: senderName });
        }
        else if (event === 'setName') {
            srvPlayerNames[playerIndex] = data || `Spieler ${playerIndex + 1}`;
            broadcast('playerStatus', { playerCount: srvActivePlayers, playerNames: srvPlayerNames });
        }
        else if (event === 'requestRestart') {
            srvRestartRequests[playerIndex] = true;
            broadcast('restartStatus', srvRestartRequests);
            if (srvRestartRequests[0] && srvRestartRequests[1]) {
                srvBoard = [6,6,6,6,6,6,0,6,6,6,6,6,6,0];
                srvCurrentPlayer = 0;
                srvRestartRequests = [false, false];
                broadcast('syncBoard', { board: srvBoard, currentPlayer: srvCurrentPlayer });
                broadcast('restartStatus', srvRestartRequests);
                broadcast('chatMessage', { id: 'server', text: 'Beide Spieler haben zugestimmt. Spiel neu gestartet!', playerIndex: -1 });
            }
        }
    }

    peer.on('connection', (conn) => {
        console.log("Incoming Guest Connection...");
        if (guestConn) { conn.close(); return; }
        guestConn = conn;
        document.getElementById('qrcode-container').style.display = 'none';
        srvActivePlayers = 2;
        
        guestConn.on('open', () => {
            console.log("Guest Connection completely open.");
            guestConn.send({ type: 'server_event', event: 'init', data: { playerIndex: 1, playerNames: srvPlayerNames } });
            broadcast('playerStatus', { playerCount: srvActivePlayers, playerNames: srvPlayerNames });
            broadcast('syncBoard', { board: srvBoard, currentPlayer: srvCurrentPlayer });
        });

        guestConn.on('data', (payload) => {
            if (payload.type === 'client_event') {
                handleHostEvent(payload.event, payload.data, 1);
            }
        });

        guestConn.on('close', () => {
            console.log("Guest Connection closed.");
            guestConn = null;
            srvActivePlayers = 1;
            document.getElementById('qrcode-container').style.display = 'block';
            srvPlayerNames[1] = "Spieler 2";
            srvRestartRequests[1] = false;
            broadcast('playerStatus', { playerCount: srvActivePlayers, playerNames: srvPlayerNames });
            broadcast('restartStatus', srvRestartRequests);
        });
        
        guestConn.on('error', (err) => {
            console.error("GuestConn ERR:", err.message || err);
        });
    });
}
