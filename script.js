document.addEventListener('DOMContentLoaded', () => {
    // FIREBASE CONFIG
    const firebaseConfig = {
      apiKey: "AIzaSyDjbjjyuh68NeEQIkwbIzaFtjaT2imXZ1c",
      authDomain: "trs-398-output-measurement.firebaseapp.com",
      projectId: "trs-398-output-measurement",
      storageBucket: "trs-398-output-measurement.firebasestorage.app",
      messagingSenderId: "942327539222",
      appId: "1:942327539222:web:a3f8261bb57ce9ee0ab737"
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();

    let currentHospitalId = null;
    let currentUserRole = null;

    // NAVIGATION
    function showView(viewId) {
        ['main-dashboard-container', 'worksheet', 'brachy-worksheet', 'admin-container'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = (id === viewId) ? 'block' : 'none';
        });
    }

    document.querySelectorAll('.back-to-dash').forEach(btn => btn.addEventListener('click', () => showView('main-dashboard-container')));
    document.getElementById('qaOutputMeasurementCard').addEventListener('click', () => showView('worksheet'));
    document.getElementById('qaBrachytherapyCard').addEventListener('click', () => showView('brachy-worksheet'));

    // AUTH STATE
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            document.getElementById('login-container').style.display = 'none';
            document.getElementById('app-container').style.display = 'block';
            document.getElementById('navUserName').textContent = user.email;
            const doc = await db.collection('Users').doc(user.uid).get();
            if (doc.exists) {
                currentHospitalId = doc.data().hospitalId;
                currentUserRole = doc.data().role;
            }
            showView('main-dashboard-container');
        } else {
            document.getElementById('app-container').style.display = 'none';
            document.getElementById('login-container').style.display = 'block';
        }
    });

    // LOGIN
    document.getElementById('loginBtn').addEventListener('click', () => {
        const e = document.getElementById('loginEmail').value, p = document.getElementById('loginPassword').value;
        auth.signInWithEmailAndPassword(e, p).catch(err => alert(err.message));
    });

    // LOGOUT
    document.getElementById('logoutBtn').addEventListener('click', () => auth.signOut());

    // --- BRACHYTHERAPY PHYSICS (Ir-192) ---
    function runBrachyCalc() {
        const a0 = parseFloat(document.getElementById('brachyA0').value);
        const certD = document.getElementById('brachyCertDate').value;
        const qaD = document.getElementById('brachyDate').value;
        const meter = parseFloat(document.getElementById('brachyMeter').value);
        const ktp = parseFloat(document.getElementById('brachyKtp').value) || 1.0;

        if (a0 && certD && qaD) {
            const days = (new Date(qaD) - new Date(certD)) / (1000*60*60*24);
            const calcAct = a0 * Math.exp(-Math.LN2 * days / 73.8); // 73.8d half-life
            document.getElementById('outBrachyCalcAct').textContent = calcAct.toFixed(3);

            if (meter) {
                const measuredAct = (meter * 4.567e5 * ktp * 1e-6) / 4.0722;
                document.getElementById('outBrachyMeasAct').textContent = measuredAct.toFixed(3);
                const dev = ((measuredAct - calcAct) / calcAct) * 100;
                const el = document.getElementById('outBrachyDev');
                el.textContent = dev.toFixed(2);
                el.style.color = Math.abs(dev) > 3 ? 'red' : 'green';
            }
        }

        const r1 = parseFloat(document.getElementById('brachyR1').value), r2 = parseFloat(document.getElementById('brachyR2').value), t = parseFloat(document.getElementById('brachyTset').value);
        if (r1 && r2 && t) {
            const alpha = ((r2 - r1) * t) / (2 * r1 - r2);
            document.getElementById('outBrachyTimerError').textContent = alpha.toFixed(3);
        }
    }
    document.querySelectorAll('#brachy-worksheet input').forEach(i => i.addEventListener('input', runBrachyCalc));

    // INVITE USER LOGIC
    document.getElementById('inviteUserBtn').addEventListener('click', async () => {
        const email = document.getElementById('inviteEmail').value, pass = document.getElementById('invitePassword').value, role = document.getElementById('inviteRole').value;
        try {
            const secApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");
            const res = await secApp.auth().createUserWithEmailAndPassword(email, pass);
            await db.collection('Users').doc(res.user.uid).set({ email, hospitalId: currentHospitalId, role, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            await secApp.auth().signOut(); await secApp.delete();
            alert("User Created!");
        } catch(e) { alert(e.message); }
    });
});
