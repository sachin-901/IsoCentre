document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. FIREBASE AUTHENTICATION & SETUP
    // ==========================================
    
    const firebaseConfig = {
      apiKey: "AIzaSyDjbjjyuh68NeEQIkwbIzaFtjaT2imXZ1c",
      authDomain: "trs-398-output-measurement.firebaseapp.com",
      projectId: "trs-398-output-measurement",
      storageBucket: "trs-398-output-measurement.firebasestorage.app",
      messagingSenderId: "942327539222",
      appId: "1:942327539222:web:a3f8261bb57ce9ee0ab737"
    };


    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginError = document.getElementById('loginError');
    const toggleAdminBtn = document.getElementById('toggleAdminBtn');

    let currentHospitalId = null;
    let currentUserRole = null;
    
    // Arrays to hold data for the Main QA Page
    let qaMachinesData = [];
    let qaChambersData = [];

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            loginContainer.style.display = 'none';
            appContainer.style.display = 'block';
            document.getElementById('navUserName').textContent = user.email;
            
            try {
                const userDoc = await db.collection('Users').doc(user.uid).get();
                if (userDoc.exists) {
                    currentHospitalId = userDoc.data().hospitalId;
                    currentUserRole = userDoc.data().role;
                    
                    if (currentUserRole !== 'chief_physicist' && currentUserRole !== 'admin') {
                        if (toggleAdminBtn) toggleAdminBtn.style.display = 'none';
                    } else {
                        if (toggleAdminBtn) toggleAdminBtn.style.display = 'inline-block';
                    }

                    // *** FETCH DATA FOR ROUTINE QA ***
                    loadQaEquipment(); 

                } else {
                    console.warn("User profile missing!");
                }
            } catch (err) { console.error("Error fetching profile:", err); }
        } else {
            appContainer.style.display = 'none';
            loginContainer.style.display = 'block';
            currentHospitalId = null;
            currentUserRole = null;
        }
    });

    loginBtn.addEventListener('click', () => {
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        loginError.style.display = 'none'; loginBtn.textContent = "Logging in...";
        auth.signInWithEmailAndPassword(email, pass).then(() => { loginBtn.textContent = "Log In"; }).catch((error) => {
            loginError.textContent = "Error: " + error.message; loginError.style.display = 'block'; loginBtn.textContent = "Log In";
        });
    });

    logoutBtn.addEventListener('click', () => auth.signOut());


    // ==========================================
    // 2. FETCHING DB DATA FOR ROUTINE QA
    // ==========================================

    async function loadQaEquipment() {
        if (!currentHospitalId) return;

        // Fetch Machines
        const mSelect = document.getElementById('therapyUnit');
        mSelect.innerHTML = '<option value="">-- Select Therapy Unit --</option>';
        qaMachinesData = [];
        const mSnap = await db.collection('Hospitals').doc(currentHospitalId).collection('Machines').get();
        mSnap.forEach(doc => {
            let m = { id: doc.id, ...doc.data() };
            qaMachinesData.push(m);
            let opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.name;
            mSelect.appendChild(opt);
        });

        // Fetch Chambers
        qaChambersData = [];
        const cSnap = await db.collection('Hospitals').doc(currentHospitalId).collection('Chambers').get();
        cSnap.forEach(doc => { qaChambersData.push({ id: doc.id, ...doc.data() }); });
    }

    function checkCalibrationWarning() {
        const qaDateVal = document.getElementById('date').value;
        const chamberId = document.getElementById('qaChamberSelect').value;
        const warningEl = document.getElementById('chamberWarning');
        
        if (!qaDateVal || !chamberId) {
            if(warningEl) warningEl.style.display = 'none';
            return;
        }
        
        const chamber = qaChambersData.find(c => c.id === chamberId);
        if (chamber && chamber.calDueDate) {
            const qaDate = new Date(qaDateVal);
            const dueDate = new Date(chamber.calDueDate);
            if (qaDate > dueDate) {
                warningEl.style.display = 'block';
                warningEl.textContent = `⚠️ Warning: Chamber calibration expired on ${chamber.calDueDate}.`;
            } else {
                warningEl.style.display = 'none';
            }
        } else {
            if(warningEl) warningEl.style.display = 'none';
        }
    }

    // Trigger warning check when QA date changes
    document.getElementById('date').addEventListener('change', checkCalibrationWarning);

    // When Therapy Unit Changes: Show valid chambers, clear table, add fresh row
    document.getElementById('therapyUnit').addEventListener('change', (e) => {
        const machineId = e.target.value;
        const cSelect = document.getElementById('qaChamberSelect');
        cSelect.innerHTML = '<option value="">-- Select Chamber --</option>';
        
        // Reset chamber details
        document.getElementById('chamberModel').value = '';
        document.getElementById('chamberSerial').value = '';
        document.getElementById('ndw').value = '';
        document.getElementById('chamberWarning').style.display = 'none';

        if (machineId) {
            // Only show chambers mapped to this machine
            const validChambers = qaChambersData.filter(c => c.targetMachineId === machineId);
            validChambers.forEach(c => {
                let opt = document.createElement('option'); opt.value = c.id; opt.textContent = `${c.model} (SN: ${c.serial})`;
                cSelect.appendChild(opt);
            });
        }
        
        // Reset table completely
        document.querySelector('#doseTable tbody').innerHTML = '';
        if(machineId) addEnergyRow(); 
        calculateAllDoses();
    });

    // When Chamber Changes: Auto-fill NDw, update all kQ values in table, check expiration
    document.getElementById('qaChamberSelect').addEventListener('change', (e) => {
        const chamberId = e.target.value;
        const c = qaChambersData.find(ch => ch.id === chamberId);
        if (c) {
            document.getElementById('chamberModel').value = c.model;
            document.getElementById('chamberSerial').value = c.serial;
            document.getElementById('ndw').value = c.ndw;
        } else {
            document.getElementById('chamberModel').value = '';
            document.getElementById('chamberSerial').value = '';
            document.getElementById('ndw').value = '';
        }
        
        checkCalibrationWarning();

        // Force rows to re-fetch kQ
        document.querySelectorAll('.inp-energy').forEach(select => {
            select.dispatchEvent(new Event('change'));
        });
        calculateAllDoses();
    });


    // ==========================================
    // 3. CALCULATOR LOGIC
    // ==========================================

    let logoBase64 = null;
    document.getElementById('logoInput').addEventListener('change', function(e) {
        const file = e.target.files[0]; const reader = new FileReader();
        reader.onloadend = function() { logoBase64 = reader.result; }
        if(file) reader.readAsDataURL(file);
    });

    const setupSelect = document.getElementById('setup');
    setupSelect.addEventListener('change', () => {
        document.getElementById('th-pdd').innerHTML = setupSelect.value === 'SSD' ? 'PDD (%) <span class="required">*</span>' : 'TPR <span class="required">*</span>';
        calculateAllDoses();
    });

    document.getElementById('phantomSelect').addEventListener('change', (e) => {
        document.getElementById('phantomOther').style.display = e.target.value === 'Other' ? 'block' : 'none';
    });

    const mPosInputs = [document.getElementById('m_pos_1'), document.getElementById('m_pos_2'), document.getElementById('m_pos_3')];
    const mNegInputs = [document.getElementById('m_neg_1'), document.getElementById('m_neg_2'), document.getElementById('m_neg_3')];
    const m1Inputs = [document.getElementById('m1_1'), document.getElementById('m1_2'), document.getElementById('m1_3')];
    
    function syncRoutineToM1() {
        let activeInputs = document.querySelector('input[name="routine_polarity"]:checked').value === 'pos' ? mPosInputs : mNegInputs;
        for(let i=0; i<3; i++){ if(m1Inputs[i] && activeInputs[i]) m1Inputs[i].value = activeInputs[i].value; }
        calculateAllDoses();
    }
    function syncM1ToRoutine() {
        let activeInputs = document.querySelector('input[name="routine_polarity"]:checked').value === 'pos' ? mPosInputs : mNegInputs;
        for(let i=0; i<3; i++){ if(m1Inputs[i] && activeInputs[i]) activeInputs[i].value = m1Inputs[i].value; }
        calculateAllDoses();
    }
    mPosInputs.forEach(i => { if(i) i.addEventListener('input', () => { if(document.querySelector('input[name="routine_polarity"]:checked').value === 'pos') syncRoutineToM1(); })});
    mNegInputs.forEach(i => { if(i) i.addEventListener('input', () => { if(document.querySelector('input[name="routine_polarity"]:checked').value === 'neg') syncRoutineToM1(); })});
    m1Inputs.forEach(i => { if(i) i.addEventListener('input', syncM1ToRoutine)});
    document.getElementsByName('routine_polarity').forEach(r => r.addEventListener('change', syncRoutineToM1));

    document.querySelectorAll('.worksheet-section input:not(.row-input), .worksheet-section select:not(.row-input)').forEach(i => {
        i.addEventListener('input', calculateAllDoses); i.addEventListener('change', calculateAllDoses);
    });

    document.getElementById('refDoseUnit').addEventListener('change', (e) => {
        document.getElementById('th-ref-unit').textContent = `[${e.target.value}]`;
        document.getElementById('th-dzmax-unit').textContent = `[${e.target.value}]`;
        calculateAllDoses();
    });

    function getVal(id) { const el = document.getElementById(id); return el ? (isNaN(parseFloat(el.value)) ? null : parseFloat(el.value)) : null; }
    function getText(id) { 
        if(id === 'therapyUnit') { 
            const select = document.getElementById('therapyUnit');
            return select.options[select.selectedIndex]?.text || '---';
        }
        return document.getElementById(id)?.value || '---'; 
    }
    function getRowVal(el) { return el ? (isNaN(parseFloat(el.value)) ? null : parseFloat(el.value)) : null; }

    function getAverageGlobal(baseId) {
        let v1 = getVal(baseId + '_1'), v2 = getVal(baseId + '_2'), v3 = getVal(baseId + '_3');
        let sum = 0, count = 0;
        if (v1 !== null) { sum += v1; count++; } if (v2 !== null) { sum += v2; count++; } if (v3 !== null) { sum += v3; count++; }
        let avgEl = document.getElementById(baseId + '_avg');
        if (count === 0) { if(avgEl) avgEl.textContent = "---"; return null; }
        let avg = sum / count; if(avgEl) avgEl.textContent = avg.toFixed(4); return avg;
    }

    function getReadingsArray(baseId) {
        let arr = [];
        let v1 = getVal(baseId + '_1'), v2 = getVal(baseId + '_2'), v3 = getVal(baseId + '_3');
        if (v1 !== null) arr.push(v1);
        if (v2 !== null) arr.push(v2);
        if (v3 !== null) arr.push(v3);
        return arr;
    }

    function calculateAllDoses() {
        let t0 = getVal('t0'), p0 = getVal('p0'), p0_unit = document.getElementById('p0_unit').value;
        let t_meas = getVal('t_meas'), p_meas = getVal('p_meas'), p_meas_unit = document.getElementById('p_meas_unit').value;
        if (p0 !== null && p0_unit === 'mbar') p0 = p0 / 10;
        if (p_meas !== null && p_meas_unit === 'mbar') p_meas = p_meas / 10;

        let kTP = 1.0;
        if (t0 !== null && p0 !== null && t_meas !== null && p_meas !== null && p_meas !== 0) {
            kTP = ((273.15 + t_meas) / (273.15 + t0)) * (p0 / p_meas);
            document.getElementById('kTP_result').textContent = kTP.toFixed(4);
        } else { document.getElementById('kTP_result').textContent = "---"; }

        let m_pos_avg = getAverageGlobal('m_pos'), m_neg_avg = getAverageGlobal('m_neg');
        let m_routine_avg = (document.querySelector('input[name="routine_polarity"]:checked').value === 'pos') ? m_pos_avg : m_neg_avg;
        let kPol = 1.0;
        if (m_pos_avg !== null && m_neg_avg !== null && m_routine_avg !== null && m_routine_avg !== 0) {
            kPol = (Math.abs(m_pos_avg) + Math.abs(m_neg_avg)) / (2 * Math.abs(m_routine_avg));
            document.getElementById('kPol_result').textContent = kPol.toFixed(4);
        } else { document.getElementById('kPol_result').textContent = "---"; }

        const v1 = getVal('v1'), v2 = getVal('v2');
        let m1_avg = getAverageGlobal('m1'), m2_avg = getAverageGlobal('m2');
        const a_coeffs = { "2.0": [2.337, -3.636, 2.299], "2.5": [1.474, -1.587, 1.114], "3.0": [1.198, -0.875, 0.677], "3.5": [1.080, -0.542, 0.463], "4.0": [1.022, -0.363, 0.341], "5.0": [0.975, -0.188, 0.214] };
        
        let kS = 1.0;
        if (v1 !== null && v2 !== null && v2 !== 0) {
            let ratio = v1 / v2; let roundedRatio = (Math.round(ratio * 2) / 2).toFixed(1); 
            document.getElementById('vRatioDisplay').textContent = ratio.toFixed(2);
            let coeffs = a_coeffs[roundedRatio];
            if (coeffs) {
                document.getElementById('a0_val').textContent = coeffs[0]; document.getElementById('a1_val').textContent = coeffs[1]; document.getElementById('a2_val').textContent = coeffs[2];
                if (m1_avg !== null && m2_avg !== null && m2_avg !== 0) {
                    kS = coeffs[0] + (coeffs[1] * (m1_avg/m2_avg)) + (coeffs[2] * Math.pow((m1_avg/m2_avg), 2));
                    document.getElementById('kS_result').textContent = kS.toFixed(4);
                } else { document.getElementById('kS_result').textContent = "---"; }
            } else {
                document.getElementById('a0_val').textContent = "N/A"; document.getElementById('a1_val').textContent = "N/A"; document.getElementById('a2_val').textContent = "N/A";
                document.getElementById('kS_result').textContent = "Out of Bounds"; kS = null; 
            }
        } else { document.getElementById('vRatioDisplay').textContent = "--"; document.getElementById('kS_result').textContent = "---"; }

        const kElec = getVal('kelec') || 1.0;
        const ndw = getVal('ndw');
        const numMu = getVal('num_mu');
        const refDoseUnit = document.getElementById('refDoseUnit').value;
        const tolerance = parseFloat(document.getElementById('toleranceSelect').value); 
        const globalFactor = (kTP !== null && kPol !== null && kS !== null) ? (kTP * kElec * kPol * kS) : null;

        document.querySelectorAll('#doseTable tbody tr').forEach(row => {
            const mraw1 = getRowVal(row.querySelector('.inp-mraw1')), mraw2 = getRowVal(row.querySelector('.inp-mraw2')), mraw3 = getRowVal(row.querySelector('.inp-mraw3'));
            const kq = getRowVal(row.querySelector('.inp-kq')), pddTpr = getRowVal(row.querySelector('.inp-pdd')), refOutput = getRowVal(row.querySelector('.inp-ref'));
            let sum = 0, count = 0;
            if (mraw1 !== null) { sum += mraw1; count++; } if (mraw2 !== null) { sum += mraw2; count++; } if (mraw3 !== null) { sum += mraw3; count++; }
            let mraw_avg = (count > 0) ? (sum / count) : null;
            row.querySelector('.mraw-avg-display').textContent = mraw_avg ? mraw_avg.toFixed(4) : "---";

            let m_corr = (mraw_avg !== null && globalFactor !== null) ? (mraw_avg * globalFactor) : null;
            let dw_zmax = null, comparison_val = null;

            if (m_corr !== null && ndw !== null && kq !== null && numMu !== null && numMu !== 0 && pddTpr !== null && pddTpr !== 0) {
                let dw_zref = (m_corr * ndw * kq) / numMu;
                dw_zmax = (document.getElementById('setup').value === 'SSD') ? ((dw_zref / pddTpr) * 100) : (dw_zref / pddTpr);
                comparison_val = (refDoseUnit === 'cGy/MU') ? dw_zmax : (1 / dw_zmax);
                row.querySelector('.out-dzmax').textContent = comparison_val.toFixed(4);
            } else { row.querySelector('.out-dzmax').textContent = "---"; }

            if (comparison_val !== null && refOutput !== null && refOutput !== 0) {
                const variation = ((comparison_val - refOutput) / refOutput) * 100;
                const varEl = row.querySelector('.out-var');
                varEl.textContent = variation.toFixed(2);
                varEl.style.color = Math.abs(variation) > tolerance ? '#d9534f' : '#5cb85c';
            } else { row.querySelector('.out-var').textContent = "---"; row.querySelector('.out-var').style.color = "inherit"; }
        });
    }

    function addEnergyRow() {
        const tbody = document.querySelector('#doseTable tbody');
        if(!tbody) return;
        const tr = document.createElement('tr');
        
        // Smart Energy Dropdown based on Therapy Unit
        const machineId = document.getElementById('therapyUnit').value;
        const machine = qaMachinesData.find(m => m.id === machineId);
        let energyOptions = '<option value="">Select...</option>';
        if (machine && machine.energies) {
            machine.energies.forEach(e => { energyOptions += `<option value="${e.energy}">${e.energy}</option>`; });
        }

        tr.innerHTML = `
            <td><select class="row-input inp-energy" style="width:100%; padding: 4px;">${energyOptions}</select></td>
            <td>
                <div class="mraw-inputs">
                    <input type="number" step="0.01" class="row-input inp-mraw1">
                    <input type="number" step="0.01" class="row-input inp-mraw2">
                    <input type="number" step="0.01" class="row-input inp-mraw3">
                </div>
                <div class="mraw-avg-display">---</div>
            </td>
            <td><input type="number" step="0.001" class="row-input inp-kq readonly-input" readonly></td>
            <td><input type="number" step="0.01" class="row-input inp-pdd"></td>
            <td><input type="number" step="0.01" class="row-input inp-ref"></td>
            <td class="td-result out-dzmax">---</td>
            <td class="td-result out-var">---</td>
            <td class="no-print"><button class="remove-btn">X</button></td>
        `;
        
        // Smart Event Listener: Auto-fill kQ when energy is selected
        tr.querySelector('.inp-energy').addEventListener('change', (e) => {
            const selectedEnergy = e.target.value;
            const chamberId = document.getElementById('qaChamberSelect').value;
            const chamber = qaChambersData.find(c => c.id === chamberId);
            
            if (chamber && chamber.kqFactors && chamber.kqFactors[selectedEnergy]) {
                tr.querySelector('.inp-kq').value = chamber.kqFactors[selectedEnergy];
            } else {
                tr.querySelector('.inp-kq').value = '';
            }
            calculateAllDoses();
        });

        tr.querySelectorAll('.row-input').forEach(inp => inp.addEventListener('input', calculateAllDoses));
        tr.querySelector('.remove-btn').addEventListener('click', () => { tr.remove(); calculateAllDoses(); });
        tbody.appendChild(tr);
    }

    document.getElementById('addRowBtn').addEventListener('click', addEnergyRow);


    // ==========================================
    // 4. COMMISSIONING ADMIN LOGIC
    // ==========================================

    const worksheetContainer = document.getElementById('worksheet');
    const adminContainer = document.getElementById('admin-container');

    document.getElementById('toggleAdminBtn').addEventListener('click', () => {
        worksheetContainer.style.display = 'none'; adminContainer.style.display = 'block'; loadAdminMachines();
    });
    document.getElementById('backToQaBtn').addEventListener('click', () => {
        adminContainer.style.display = 'none'; worksheetContainer.style.display = 'block'; loadQaEquipment(); // Refresh UI on return
    });

    document.getElementById('adminAddEnergyBtn').addEventListener('click', () => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="admin-energy-name" placeholder="e.g. 6 MV"></td>
            <td><input type="number" step="0.001" class="admin-tpr"></td>
            <td><input type="number" step="0.01" class="admin-pdd"></td>
            <td><input type="number" step="0.01" class="admin-tmr"></td>
            <td><button class="btn admin-remove-btn" style="background: #d9534f; padding: 4px 8px;">X</button></td>
        `;
        tr.querySelector('.admin-remove-btn').addEventListener('click', () => tr.remove());
        document.querySelector('#adminEnergyTable tbody').appendChild(tr);
    });

    document.getElementById('saveMachineBtn').addEventListener('click', async () => {
        if (!currentHospitalId) return alert("Error: User does not belong to a hospital.");
        const name = document.getElementById('adminMachineName').value;
        if (!name) return alert("Please enter a Machine Name.");

        const energies = [];
        document.querySelectorAll('#adminEnergyTable tbody tr').forEach(row => {
            const eName = row.querySelector('.admin-energy-name').value;
            const tpr = parseFloat(row.querySelector('.admin-tpr').value);
            const pdd = parseFloat(row.querySelector('.admin-pdd').value);
            const tmr = parseFloat(row.querySelector('.admin-tmr').value);
            
            if (eName && !isNaN(tpr)) {
                energies.push({ 
                    energy: eName, 
                    tpr2010: tpr, 
                    refPdd: isNaN(pdd) ? null : pdd, 
                    refTmr: isNaN(tmr) ? null : tmr,
                    baselineSet: false 
                });
            }
        });
        if (energies.length === 0) return alert("Please add at least one valid energy.");

        try {
            await db.collection('Hospitals').doc(currentHospitalId).collection('Machines').add({ name: name, energies: energies, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            alert("Machine saved!"); document.getElementById('adminMachineName').value = ''; loadAdminMachines();
        } catch (error) { alert("Error saving machine. Check console permissions."); }
    });

    // TRS-398 Interpolation
    const trs398Data = { "PTW 30013": [ { tpr: 0.50, kq: 1.000 }, { tpr: 0.53, kq: 0.999 }, { tpr: 0.56, kq: 0.997 }, { tpr: 0.59, kq: 0.995 }, { tpr: 0.62, kq: 0.992 }, { tpr: 0.65, kq: 0.989 }, { tpr: 0.68, kq: 0.985 }, { tpr: 0.71, kq: 0.980 }, { tpr: 0.74, kq: 0.974 }, { tpr: 0.77, kq: 0.967 }, { tpr: 0.80, kq: 0.959 } ] };
    function interpolateKq(model, tprTarget) {
        if (!trs398Data[model]) return 1.000; 
        const data = trs398Data[model];
        for (let i = 0; i < data.length - 1; i++) {
            if (tprTarget >= data[i].tpr && tprTarget <= data[i+1].tpr) {
                return parseFloat((data[i].kq + ((data[i+1].kq - data[i].kq) / (data[i+1].tpr - data[i].tpr)) * (tprTarget - data[i].tpr)).toFixed(3));
            }
        } return 1.000; 
    }

    let adminCurrentMachines = [];
    async function loadAdminMachines() {
        if (!currentHospitalId) return;
        const select = document.getElementById('adminTargetMachine');
        select.innerHTML = '<option value="">-- Select Machine --</option>'; adminCurrentMachines = [];
        const snapshot = await db.collection('Hospitals').doc(currentHospitalId).collection('Machines').get();
        snapshot.forEach(doc => {
            const m = { id: doc.id, ...doc.data() }; adminCurrentMachines.push(m);
            const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.name; select.appendChild(opt);
        });
    }

    let calculatedKqFactors = {};
    document.getElementById('adminTargetMachine').addEventListener('change', (e) => {
        const machineId = e.target.value; const model = document.getElementById('adminChamberModel').value || "PTW 30013"; 
        const kqSection = document.getElementById('chamberKqSection'); const resultsDiv = document.getElementById('chamberKqResults');
        calculatedKqFactors = {}; resultsDiv.innerHTML = '';
        if (!machineId) { kqSection.style.display = 'none'; return; }
        const machine = adminCurrentMachines.find(m => m.id === machineId);
        if(machine && machine.energies) {
            machine.energies.forEach(eng => {
                const kq = interpolateKq(model, eng.tpr2010); calculatedKqFactors[eng.energy] = kq;
                resultsDiv.innerHTML += `<div style="background: white; padding: 10px; border: 1px solid #ccc; border-radius: 4px;"><strong>${eng.energy}</strong><br>TPR: ${eng.tpr2010} &rarr; <strong>k<sub>Q</sub>: ${kq}</strong></div>`;
            });
            kqSection.style.display = 'block';
        }
    });

    document.getElementById('saveChamberBtn').addEventListener('click', async () => {
        if (!currentHospitalId) return alert("Error: User does not belong to a hospital.");
        const model = document.getElementById('adminChamberModel').value, serial = document.getElementById('adminChamberSerial').value;
        const ndw = parseFloat(document.getElementById('adminChamberNdw').value), machineId = document.getElementById('adminTargetMachine').value;
        const calDate = document.getElementById('adminChamberCalDate').value;
        const calDueDate = document.getElementById('adminChamberCalDueDate').value;

        if (!model || !serial || isNaN(ndw) || !machineId) return alert("Please fill out all required chamber details and select a machine.");
        try {
            await db.collection('Hospitals').doc(currentHospitalId).collection('Chambers').add({ 
                model: model, 
                serial: serial, 
                ndw: ndw, 
                targetMachineId: machineId, 
                kqFactors: calculatedKqFactors, 
                calDate: calDate || null,
                calDueDate: calDueDate || null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp() 
            });
            alert("Chamber saved!"); 
            document.getElementById('adminChamberModel').value = ''; 
            document.getElementById('adminChamberSerial').value = ''; 
            document.getElementById('adminChamberNdw').value = ''; 
            document.getElementById('adminChamberCalDate').value = '';
            document.getElementById('adminChamberCalDueDate').value = '';
            document.getElementById('chamberKqSection').style.display = 'none'; 
            document.getElementById('adminTargetMachine').value = '';
        } catch (error) { alert("Error saving chamber."); }
    });


    // ==========================================
    // 5. PDF GENERATION WITH IsoCentre BRANDING
    // ==========================================

    document.getElementById('generatePdfBtn').addEventListener('click', () => {
        const therapyUnit = getText('therapyUnit'); let phant = document.getElementById('phantomSelect').value; if(phant === 'Other') phant = getText('phantomOther');
        const setup = document.getElementById('setup').value, zref = getText('zref'), fSize = getText('fieldSize'), mu = getText('num_mu');
        const kTP = document.getElementById('kTP_result').textContent, kPol = document.getElementById('kPol_result').textContent, kS = document.getElementById('kS_result').textContent, kElec = getText('kelec');
        const pddOrTpr = setup === 'SSD' ? 'PDD (%)' : 'TPR', refUnit = document.getElementById('refDoseUnit').value;

        const whiteIsoLogo = `<svg viewBox="0 0 140 30" xmlns="http://www.w3.org/2000/svg"><circle cx="15" cy="15" r="10" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.4"/><line x1="15" y1="2" x2="15" y2="28" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="2 2" opacity="0.7"/><line x1="2" y1="15" x2="28" y2="15" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="2 2" opacity="0.7"/><circle cx="15" cy="15" r="3.5" fill="#00d2ff" /><text x="35" y="21" font-family="Arial, sans-serif" font-size="18" fill="#ffffff" font-weight="bold" letter-spacing="0.5">Iso<tspan font-weight="normal" fill="#aaccff">Centre</tspan></text></svg>`;

        let ktpTable = { widths: ['auto', 'auto'], body: [ [{text: 'Parameter', style: 'th'}, {text: 'Value', style: 'th'}], [{text: 'T0 [°C]', style: 'label'}, {text: getText('t0'), style: 'cell'}], [{text: `P0 [${document.getElementById('p0_unit').value}]`, style: 'label'}, {text: getText('p0'), style: 'cell'}], [{text: 'Measured T [°C]', style: 'label'}, {text: getText('t_meas'), style: 'cell'}], [{text: `Measured P [${document.getElementById('p_meas_unit').value}]`, style: 'label'}, {text: getText('p_meas'), style: 'cell'}], [{text: 'k_TP', style: 'label'}, {text: kTP, style: 'cell', bold: true}] ] };

        let posArr = [getVal('m_pos_1'), getVal('m_pos_2'), getVal('m_pos_3')].filter(v=>v!==null), negArr = [getVal('m_neg_1'), getVal('m_neg_2'), getVal('m_neg_3')].filter(v=>v!==null);
        let polCols = Math.max(posArr.length, negArr.length, 0); let polHeader = [{text: 'Polarity', style: 'th'}]; for(let i=1; i<=polCols; i++) { polHeader.push({text: `Rdg ${i}`, style: 'th'}); } polHeader.push({text: 'Avg', style: 'th'});
        let posRow = [{text: 'Positive (+)', style: 'label'}]; for(let i=0; i<polCols; i++) { posRow.push({text: posArr[i] !== undefined ? posArr[i] : '---', style: 'cell'}); } posRow.push({text: document.getElementById('m_pos_avg').textContent, style: 'cell'});
        let negRow = [{text: 'Negative (-)', style: 'label'}]; for(let i=0; i<polCols; i++) { negRow.push({text: negArr[i] !== undefined ? negArr[i] : '---', style: 'cell'}); } negRow.push({text: document.getElementById('m_neg_avg').textContent, style: 'cell'});
        let kPolResultRow = [{text: 'k_pol =', colSpan: polCols + 1, style: 'label', alignment: 'right'}, ...Array(polCols).fill(''), {text: kPol, style: 'cell', bold: true}];
        let polTable = { widths: Array(polHeader.length).fill('auto'), body: [ polHeader, posRow, negRow, kPolResultRow ] };

        let m1Arr = [getVal('m1_1'), getVal('m1_2'), getVal('m1_3')].filter(v=>v!==null), m2Arr = [getVal('m2_1'), getVal('m2_2'), getVal('m2_3')].filter(v=>v!==null);
        let ksCols = Math.max(m1Arr.length, m2Arr.length, 0); let ksHeader = [{text: 'Voltage [V]', style: 'th'}]; for(let i=1; i<=ksCols; i++) { ksHeader.push({text: `Rdg ${i}`, style: 'th'}); } ksHeader.push({text: 'Avg', style: 'th'});
        let ksRow1 = [{text: `Normal (${getText('v1')}V)`, style:'label'}]; for(let i=0; i<ksCols; i++) { ksRow1.push({text: m1Arr[i] !== undefined ? m1Arr[i] : '---', style: 'cell'}); } ksRow1.push({text: document.getElementById('m1_avg').textContent, style:'cell'});
        let ksRow2 = [{text: `Reduced (${getText('v2')}V)`, style:'label'}]; for(let i=0; i<ksCols; i++) { ksRow2.push({text: m2Arr[i] !== undefined ? m2Arr[i] : '---', style: 'cell'}); } ksRow2.push({text: document.getElementById('m2_avg').textContent, style:'cell'});
        let ksResultRow = [{text: 'k_s =', colSpan: ksCols + 1, style: 'label', alignment: 'right'}, ...Array(ksCols).fill(''), {text: kS, style: 'cell', bold: true}];
        let ksTable = { widths: Array(ksHeader.length).fill('auto'), body: [ ksHeader, ksRow1, ksRow2, ksResultRow ] };

        let coeffsTable = { widths: ['auto', 'auto', 'auto'], body: [ [{text: 'a0', style: 'th'}, {text: 'a1', style: 'th'}, {text: 'a2', style: 'th'}], [{text: document.getElementById('a0_val').textContent, style: 'cell'}, {text: document.getElementById('a1_val').textContent, style: 'cell'}, {text: document.getElementById('a2_val').textContent, style: 'cell'}] ] };

        let finalRowsData = []; let maxFinalCols = 0;
        document.querySelectorAll('#doseTable tbody tr').forEach(row => {
            let arr = [getRowVal(row.querySelector('.inp-mraw1')), getRowVal(row.querySelector('.inp-mraw2')), getRowVal(row.querySelector('.inp-mraw3'))].filter(v=>v!==null);
            if(arr.length > maxFinalCols) maxFinalCols = arr.length; finalRowsData.push({ rowEl: row, arr: arr });
        });

        let finalHeader = [{text: 'Energy', style: 'th'}]; for(let i=1; i<=maxFinalCols; i++) { finalHeader.push({text: `M_raw ${i}`, style: 'th'}); } finalHeader.push( {text: 'Avg\nM_raw', style: 'th'}, {text: 'kQ', style: 'th'}, {text: pddOrTpr, style: 'th'}, {text: `Ref Output\n[${refUnit}]`, style: 'th'}, {text: `Dw(Zmax)\n[${refUnit}]`, style: 'th'}, {text: 'Var (%)', style: 'th'} );
        let resultsTableBody = [finalHeader];

        finalRowsData.forEach(data => {
            let row = data.rowEl, arr = data.arr;
            let engStr = row.querySelector('.inp-energy').value || '---';
            let mraw_avg = row.querySelector('.mraw-avg-display').textContent;
            let kq = row.querySelector('.inp-kq').value || '---', pdd = row.querySelector('.inp-pdd').value || '---', ref = row.querySelector('.inp-ref').value || '---';
            let dzmax = row.querySelector('.out-dzmax').textContent, varObj = row.querySelector('.out-var'), variation = varObj.textContent;
            const varColor = (varObj.style.color === 'rgb(217, 83, 79)') ? '#d9534f' : (varObj.style.color === 'rgb(92, 184, 92)') ? '#5cb85c' : '#333';
            let pdfRow = [{text: engStr, style: 'label'}]; for(let i=0; i<maxFinalCols; i++) { pdfRow.push({text: arr[i] !== undefined ? arr[i] : '---', style: 'cell'}); }
            pdfRow.push( {text: mraw_avg, style: 'label'}, {text: kq, style: 'cell'}, {text: pdd, style: 'cell'}, {text: ref, style: 'cell'}, {text: dzmax, bold: true, alignment: 'center'}, {text: variation, bold: true, color: varColor, alignment: 'center'} );
            resultsTableBody.push(pdfRow);
        });

        const docDefinition = {
            pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [40, 40, 40, 50], 
            
            // --- RESTORED 3-COLUMN TABLE FOOTER ---
            footer: function(currentPage, pageCount) {
                return {
                    margin: [-40, 15, -40, 0], 
                    table: {
                        widths: ['*', '*', '*'], 
                        body: [
                            [
                                { svg: whiteIsoLogo, width: 80, fillColor: '#0056b3', alignment: 'left', margin: [80, 2, 0, 2] },
                                { svg: whiteIsoLogo, width: 80, fillColor: '#0056b3', alignment: 'center', margin: [0, 2, 0, 2] },
                                { svg: whiteIsoLogo, width: 80, fillColor: '#0056b3', alignment: 'right', margin: [0, 2, 80, 2] }
                            ]
                        ]
                    },
                    layout: {
                        defaultBorder: false,
                        paddingLeft: function() { return 0; },
                        paddingRight: function() { return 0; },
                        paddingTop: function() { return 0; },
                        paddingBottom: function() { return 0; }
                    }
                };
            },
            
            styles: { title: { fontSize: 16, bold: true, color: '#0056b3', alignment: 'center', margin: [0, 0, 0, 5] }, subtitle: { fontSize: 12, alignment: 'center', margin: [0, 0, 0, 20] }, sectionHeader: { fontSize: 13, bold: true, color: '#0056b3', margin: [0, 15, 0, 8] }, th: { bold: true, fillColor: '#eef2f5', color: '#0056b3', alignment: 'center', margin: [0,4,0,4] }, cell: { margin: [0,4,0,4], alignment: 'center' }, label: { bold: true, color: '#333', alignment: 'center', margin: [0,4,0,4] } },
            content: [
                { columns: [ logoBase64 ? { image: logoBase64, width: 80, alignment: 'left' } : { text: '', width: 80 }, { width: '*', text: [ { text: `REPORT ON OUTPUT MEASUREMENT OF ${therapyUnit.toUpperCase() || 'THERAPY UNIT'}\n`, style: 'title' }, { text: `Date: ${document.getElementById('date').value || '---'}`, style: 'subtitle' } ] }, { width: 80, text: '' } ], margin: [0, 0, 0, 20] },
                { pageBreak: 'avoid', columns: [ { width: '48%', table: { widths: ['50%', '50%'], body: [ [{text: '1. Measurement Conditions', colSpan: 2, style: 'th'}, {}], [{text: 'Phantom', style: 'label'}, {text: phant, style: 'cell'}], [{text: 'Setup', style: 'label'}, {text: setup, style: 'cell'}], [{text: 'Zref [g/cm²]', style: 'label'}, {text: zref, style: 'cell'}], [{text: 'Field Size [cm x cm]', style: 'label'}, {text: fSize, style: 'cell'}], [{text: 'No. of MU', style: 'label'}, {text: mu, style: 'cell'}] ] } }, { width: '4%', text: '' }, { width: '48%', table: { widths: ['50%', '50%'], body: [ [{text: '2. Dosimetry Equipment', colSpan: 2, style: 'th'}, {}], [{text: 'Chamber Model (SN)', style: 'label'}, {text: `${document.getElementById('chamberModel').value} (${document.getElementById('chamberSerial').value})`, style: 'cell'}], [{text: 'N_D,w [cGy/nC]', style: 'label'}, {text: document.getElementById('ndw').value, style: 'cell'}], [{text: 'Calibration Lab', style: 'label'}, {text: getText('calLab'), style: 'cell'}], [{text: 'Electrometer (SN)', style: 'label'}, {text: `${getText('elecModel')} (${getText('elecSerial')})`, style: 'cell'}] ] } } ] },
                { text: '3. Applied Correction Factors', style: 'sectionHeader', pageBreak: 'avoid' }, { columns: [ { width: 'auto', margin: [0,0,15,0], pageBreak: 'avoid', table: ktpTable }, { width: 'auto', margin: [0,0,15,0], pageBreak: 'avoid', table: polTable }, { width: 'auto', pageBreak: 'avoid', table: { widths: ['auto', 'auto'], body: [ [{text: 'Factor', style: 'th'}, {text: 'Value', style: 'th'}], [{text: 'k_elec', style: 'label'}, {text: getText('kelec'), style: 'cell'}] ] } } ] },
                { pageBreak: 'avoid', margin: [0, 15, 0, 0], columns: [ { width: 'auto', table: ksTable } ] }, { pageBreak: 'avoid', margin: [0, 5, 0, 15], columns: [ { width: 'auto', table: coeffsTable } ] },
                { text: '4. Absorbed Dose to Water Results', style: 'sectionHeader', pageBreak: 'avoid' }, { pageBreak: 'avoid', table: { headerRows: 1, widths: Array(finalHeader.length).fill('auto'), body: resultsTableBody } },
                { pageBreak: 'avoid', columns: [ { text: `Performed by:\n\n\n___________________________\n${getText('userName')}`, alignment: 'left', margin: [0, 50, 0, 0] }, { text: `Incharge Medical Physicist/RSO:\n\n\n___________________________\n`, alignment: 'right', margin: [0, 50, 0, 0] } ] }
            ]
        };
        pdfMake.createPdf(docDefinition).download(`${therapyUnit.replace(/[^a-z0-9]/gi, '_') || 'Unit'}_${document.getElementById('date').value || 'Date'}.pdf`);
    });
});
