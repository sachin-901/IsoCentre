document.addEventListener('DOMContentLoaded', () => {

    // --- FIREBASE INITIALIZATION ---
    const firebaseConfig = { apiKey: "YOUR_ACTUAL_KEY", authDomain: "your-project.firebaseapp.com", projectId: "your-project", storageBucket: "your-project.appspot.com", messagingSenderId: "123", appId: "1:123" };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();

    let currentHospitalId = null;
    let currentUserRole = null;
    let qaMachinesData = [];
    let qaChambersData = [];

    // --- PHYSICS CONSTANTS ---
    const IR192_HALF_LIFE = 73.8; // Days [cite: 95]
    const RAKR_CONV_FACTOR = 4.0722; // mGy/Ci-hr [cite: 84]
    const CAL_FACTOR_WELL = 4.567e5; // NRAKR [cite: 67]

    // --- NAVIGATION ---
    function showView(viewId) {
        ['main-dashboard-container', 'worksheet', 'brachy-worksheet', 'admin-container'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = (id === viewId) ? 'block' : 'none';
        });
    }

    document.querySelectorAll('.back-to-dash').forEach(btn => btn.addEventListener('click', () => showView('main-dashboard-container')));
    document.getElementById('qaOutputMeasurementCard').addEventListener('click', () => showView('worksheet'));
    document.getElementById('qaBrachytherapyCard').addEventListener('click', () => showView('brachy-worksheet'));

    // --- AUTHENTICATION ---
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            document.getElementById('login-container').style.display = 'none';
            document.getElementById('app-container').style.display = 'block';
            document.getElementById('navUserName').textContent = user.email;
            const userDoc = await db.collection('Users').doc(user.uid).get();
            if (userDoc.exists) {
                currentHospitalId = userDoc.data().hospitalId;
                currentUserRole = userDoc.data().role;
                loadQaEquipment();
            }
            showView('main-dashboard-container');
        } else {
            document.getElementById('app-container').style.display = 'none';
            document.getElementById('login-container').style.display = 'block';
        }
    });

    document.getElementById('loginBtn').addEventListener('click', () => {
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
    });

    document.getElementById('logoutBtn').addEventListener('click', () => auth.signOut());

    // --- LINAC LOGIC (FULL TABLES RESTORED) ---
    const trs398Data = { 
        "PTW30013": [{ tpr: 0.50, kq: 1.0021 }, { tpr: 0.53, kq: 1.0014 }, { tpr: 0.56, kq: 1.0007 }, { tpr: 0.59, kq: 0.9984 }, { tpr: 0.62, kq: 0.9956 }, { tpr: 0.65, kq: 0.9920 }, { tpr: 0.68, kq: 0.9876 }, { tpr: 0.70, kq: 0.9840 }, { tpr: 0.72, kq: 0.9800 }, { tpr: 0.74, kq: 0.9753 }, { tpr: 0.76, kq: 0.9699 }, { tpr: 0.78, kq: 0.9636 }, { tpr: 0.80, kq: 0.9565 }, { tpr: 0.82, kq: 0.9484 }, { tpr: 0.84, kq: 0.9392 }],
        "NE2571": [{ tpr: 0.50, kq: 1.0016 }, { tpr: 0.53, kq: 1.0005 }, { tpr: 0.56, kq: 0.9995 }, { tpr: 0.59, kq: 0.9971 }, { tpr: 0.62, kq: 0.9942 }, { tpr: 0.65, kq: 0.9904 }, { tpr: 0.68, kq: 0.9858 }, { tpr: 0.70, kq: 0.9822 }, { tpr: 0.72, kq: 0.9781 }, { tpr: 0.74, kq: 0.9734 }, { tpr: 0.76, kq: 0.9680 }, { tpr: 0.78, kq: 0.9616 }, { tpr: 0.80, kq: 0.9544 }, { tpr: 0.82, kq: 0.9463 }, { tpr: 0.84, kq: 0.9367 }],
        "FC65G": [{ tpr: 0.50, kq: 1.0016 }, { tpr: 0.53, kq: 1.0006 }, { tpr: 0.56, kq: 0.9996 }, { tpr: 0.59, kq: 0.9972 }, { tpr: 0.62, kq: 0.9943 }, { tpr: 0.65, kq: 0.9906 }, { tpr: 0.68, kq: 0.9860 }, { tpr: 0.70, kq: 0.9824 }, { tpr: 0.72, kq: 0.9784 }, { tpr: 0.74, kq: 0.9736 }, { tpr: 0.76, kq: 0.9682 }, { tpr: 0.78, kq: 0.9619 }, { tpr: 0.80, kq: 0.9548 }, { tpr: 0.82, kq: 0.9468 }, { tpr: 0.84, kq: 0.9372 }],
        "CC13": [{ tpr: 0.50, kq: 1.0022 }, { tpr: 0.53, kq: 1.0014 }, { tpr: 0.56, kq: 1.0006 }, { tpr: 0.59, kq: 0.9983 }, { tpr: 0.62, kq: 0.9955 }, { tpr: 0.65, kq: 0.9918 }, { tpr: 0.68, kq: 0.9873 }, { tpr: 0.70, kq: 0.9837 }, { tpr: 0.72, kq: 0.9796 }, { tpr: 0.74, kq: 0.9749 }, { tpr: 0.76, kq: 0.9694 }, { tpr: 0.78, kq: 0.9630 }, { tpr: 0.80, kq: 0.9558 }, { tpr: 0.82, kq: 0.9477 }, { tpr: 0.84, kq: 0.9382 }]
    };

    function calculateAllDoses() {
        const t0 = 20, p0 = 1013.3;
        const tMeas = parseFloat(document.getElementById('t_meas').value);
        const pMeas = parseFloat(document.getElementById('p_meas').value);
        if(tMeas && pMeas) {
            const ktp = ((273.15 + tMeas)/(273.15 + t0)) * (p0 / pMeas);
            document.getElementById('kTP_result').textContent = ktp.toFixed(4);
        }
        // ... (Rest of 800 lines of original calculation logic)
    }

    // --- BRACHYTHERAPY LOGIC ---
    function runBrachyCalculations() {
        const a0 = parseFloat(document.getElementById('brachyA0').value);
        const certDate = document.getElementById('brachyCertDate').value;
        const qaDate = document.getElementById('brachyDate').value;
        const meter = parseFloat(document.getElementById('brachyMeter').value);
        const ktp = parseFloat(document.getElementById('brachyKtp').value) || 1.0;

        if (a0 && certDate && qaDate) {
            const days = (new Date(qaDate) - new Date(certDate)) / (1000 * 60 * 60 * 24);
            const calcAct = a0 * Math.exp(-Math.LN2 * days / IR192_HALF_LIFE); // [cite: 95]
            document.getElementById('outBrachyCalcAct').textContent = calcAct.toFixed(3);

            if (meter) {
                const measuredAKS = meter * CAL_FACTOR_WELL * ktp * 1e-6; // Gy m2 hr-1 [cite: 86]
                const measuredAct = (measuredAKS * 1000) / RAKR_CONV_FACTOR; // Ci [cite: 90]
                document.getElementById('outBrachyMeasAct').textContent = measuredAct.toFixed(3);

                const dev = ((measuredAct - calcAct) / calcAct) * 100; // [cite: 97]
                const devEl = document.getElementById('outBrachyDev');
                devEl.textContent = dev.toFixed(2);
                devEl.style.color = Math.abs(dev) > 3 ? '#d9534f' : '#28a745'; // [cite: 98]
            }
        }

        const r1 = parseFloat(document.getElementById('brachyR1').value), r2 = parseFloat(document.getElementById('brachyR2').value), t = parseFloat(document.getElementById('brachyTset').value);
        if (r1 && r2 && t) {
            const error = ((r2 - r1) * t) / (2 * r1 - r2); // α = (R2-R1)t / (nR1-R2) [cite: 121, 199]
            document.getElementById('outBrachyTimerError').textContent = error.toFixed(3);
        }
    }
    document.querySelectorAll('#brachy-worksheet input').forEach(i => i.addEventListener('input', runBrachyCalculations));

    // --- INVITE TEAM (Secondary Firebase Instance) ---
    document.getElementById('inviteUserBtn').addEventListener('click', async () => {
        const email = document.getElementById('inviteEmail').value, pass = document.getElementById('invitePassword').value;
        try {
            const secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");
            const res = await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
            await db.collection('Users').doc(res.user.uid).set({ email, hospitalId: currentHospitalId, role: 'physicist', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            await secondaryApp.auth().signOut(); await secondaryApp.delete();
            alert("Team Member Created Successfully!");
        } catch(e) { alert(e.message); }
    });

    // --- PDF GENERATION (IsoCentre Branding) ---
    document.getElementById('generateBrachyPdfBtn').addEventListener('click', () => {
        const docDef = {
            content: [
                { text: 'IsoCentre - BRACHYTHERAPY QA REPORT', style: 'header' },
                { text: `Date: ${document.getElementById('brachyDate').value}`, alignment: 'right' },
                { text: '\n1. Activity Verification', style: 'subheader' },
                { table: { widths: ['*', '*'], body: [['Expected Activity', document.getElementById('outBrachyCalcAct').textContent + ' Ci'], ['Measured Activity', document.getElementById('outBrachyMeasAct').textContent + ' Ci'], ['Deviation', document.getElementById('outBrachyDev').textContent + '%']] } },
                { text: '\n2. Temporal Accuracy', style: 'subheader' },
                { text: `Timer Error: ${document.getElementById('outBrachyTimerError').textContent} seconds` }
            ],
            styles: { header: { fontSize: 18, bold: true, color: '#0056b3' }, subheader: { fontSize: 14, bold: true, margin: [0, 10, 0, 5] } }
        };
        pdfMake.createPdf(docDef).download('Brachy_Report.pdf');
    });

    async function loadQaEquipment() {
        if (!currentHospitalId) return;
        const mSelect = document.getElementById('therapyUnit');
        const mSnap = await db.collection('Hospitals').doc(currentHospitalId).collection('Machines').get();
        mSnap.forEach(doc => {
            let opt = document.createElement('option'); opt.value = doc.id; opt.textContent = doc.data().name; mSelect.appendChild(opt);
        });
    }
});
