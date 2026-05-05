document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. FIREBASE AUTHENTICATION & SETUP
    // ==========================================

    // IMPORTANT: Replace this block with your actual keys from the Firebase Console!
    const firebaseConfig = {
      apiKey: "AIzaSyDjbjjyuh68NeEQIkwbIzaFtjaT2imXZ1c",
      authDomain: "trs-398-output-measurement.firebaseapp.com",
      projectId: "trs-398-output-measurement",
      storageBucket: "trs-398-output-measurement.firebasestorage.app",
      messagingSenderId: "942327539222",
      appId: "1:942327539222:web:a3f8261bb57ce9ee0ab737"
    };
    // Initialize Firebase 
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    // DOM Elements for Login
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginError = document.getElementById('loginError');
    const toggleAdminBtn = document.getElementById('toggleAdminBtn');

    // Multi-tenant Globals
    let currentHospitalId = null;
    let currentUserRole = null;

    // Auth State Observer
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            loginContainer.style.display = 'none';
            appContainer.style.display = 'block';
            document.getElementById('navUserName').textContent = user.email;
            
            // FETCH USER PROFILE FROM FIRESTORE
            try {
                const userDoc = await db.collection('Users').doc(user.uid).get();
                if (userDoc.exists) {
                    currentHospitalId = userDoc.data().hospitalId;
                    currentUserRole = userDoc.data().role;
                    
                    // SECURITY UI: Hide Commissioning button if not qualified
                    if (currentUserRole !== 'chief_physicist' && currentUserRole !== 'admin') {
                        if (toggleAdminBtn) toggleAdminBtn.style.display = 'none';
                    } else {
                        if (toggleAdminBtn) toggleAdminBtn.style.display = 'inline-block';
                    }
                } else {
                    console.warn("User profile document is missing in the database! Please create it manually.");
                }
            } catch (err) {
                console.error("Error fetching user profile:", err);
            }
        } else {
            appContainer.style.display = 'none';
            loginContainer.style.display = 'block';
            currentHospitalId = null;
            currentUserRole = null;
        }
    });

    // Login Logic
    loginBtn.addEventListener('click', () => {
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        
        loginError.style.display = 'none'; 
        loginBtn.textContent = "Logging in...";
        
        auth.signInWithEmailAndPassword(email, pass)
            .then(() => {
                loginBtn.textContent = "Log In";
            })
            .catch((error) => {
                loginError.textContent = "Error: " + error.message;
                loginError.style.display = 'block';
                loginBtn.textContent = "Log In";
            });
    });

    // Logout Logic
    logoutBtn.addEventListener('click', () => {
        auth.signOut();
    });


    // ==========================================
    // 2. MAIN CALCULATOR LOGIC
    // ==========================================

    let logoBase64 = null;
    document.getElementById('logoInput').addEventListener('change', function(e) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onloadend = function() { logoBase64 = reader.result; }
        if(file) reader.readAsDataURL(file);
    });

    const setupSelect = document.getElementById('setup');
    const thPdd = document.getElementById('th-pdd');

    function updateSetupLabels() {
        if (setupSelect.value === 'SSD') {
            thPdd.innerHTML = 'PDD (%) <span class="required">*</span>';
        } else {
            thPdd.innerHTML = 'TPR <span class="required">*</span>';
        }
        calculateAllDoses();
    }
    if (setupSelect) setupSelect.addEventListener('change', updateSetupLabels);

    const phantomSelect = document.getElementById('phantomSelect');
    const phantomOther = document.getElementById('phantomOther');
    if (phantomSelect) {
        phantomSelect.addEventListener('change', () => {
            phantomOther.style.display = phantomSelect.value === 'Other' ? 'block' : 'none';
        });
    }

    const mPosInputs = [document.getElementById('m_pos_1'), document.getElementById('m_pos_2'), document.getElementById('m_pos_3')];
    const mNegInputs = [document.getElementById('m_neg_1'), document.getElementById('m_neg_2'), document.getElementById('m_neg_3')];
    const m1Inputs = [document.getElementById('m1_1'), document.getElementById('m1_2'), document.getElementById('m1_3')];
    const routineRadios = document.getElementsByName('routine_polarity');

    function syncRoutineToM1() {
        let checkedRadio = document.querySelector('input[name="routine_polarity"]:checked');
        if (!checkedRadio) return;
        let activeInputs = checkedRadio.value === 'pos' ? mPosInputs : mNegInputs;
        for(let i=0; i<3; i++){ if(m1Inputs[i] && activeInputs[i]) m1Inputs[i].value = activeInputs[i].value; }
        calculateAllDoses();
    }
    function syncM1ToRoutine() {
        let checkedRadio = document.querySelector('input[name="routine_polarity"]:checked');
        if (!checkedRadio) return;
        let activeInputs = checkedRadio.value === 'pos' ? mPosInputs : mNegInputs;
        for(let i=0; i<3; i++){ if(m1Inputs[i] && activeInputs[i]) activeInputs[i].value = m1Inputs[i].value; }
        calculateAllDoses();
    }

    mPosInputs.forEach(input => { if (input) input.addEventListener('input', () => {
        if(document.querySelector('input[name="routine_polarity"]:checked').value === 'pos') syncRoutineToM1();
    })});
    mNegInputs.forEach(input => { if (input) input.addEventListener('input', () => {
        if(document.querySelector('input[name="routine_polarity"]:checked').value === 'neg') syncRoutineToM1();
    })});
    m1Inputs.forEach(input => { if (input) input.addEventListener('input', syncM1ToRoutine)});
    routineRadios.forEach(radio => radio.addEventListener('change', syncRoutineToM1));

    document.querySelectorAll('.worksheet-section input:not(.row-input), .worksheet-section select:not(.row-input)').forEach(input => {
        input.addEventListener('input', calculateAllDoses);
        input.addEventListener('change', calculateAllDoses);
    });

    const refDoseUnitSelect = document.getElementById('refDoseUnit');
    if (refDoseUnitSelect) {
        refDoseUnitSelect.addEventListener('change', () => {
            const unit = document.getElementById('refDoseUnit').value;
            document.getElementById('th-ref-unit').textContent = `[${unit}]`;
            document.getElementById('th-dzmax-unit').textContent = `[${unit}]`;
            calculateAllDoses();
        });
    }
    const toleranceSelect = document.getElementById('toleranceSelect');
    if (toleranceSelect) toleranceSelect.addEventListener('change', calculateAllDoses);

    function getVal(id) { 
        const el = document.getElementById(id);
        if (!el) return null;
        const val = parseFloat(el.value); 
        return isNaN(val) ? null : val; 
    }
    function getText(id) { 
        const el = document.getElementById(id);
        return el ? (el.value || '---') : '---'; 
    }
    function getRowVal(inputObj) { 
        if (!inputObj) return null;
        const val = parseFloat(inputObj.value); 
        return isNaN(val) ? null : val; 
    }

    function getAverageGlobal(baseId) {
        let v1 = getVal(baseId + '_1'), v2 = getVal(baseId + '_2'), v3 = getVal(baseId + '_3');
        let sum = 0, count = 0;
        if (v1 !== null) { sum += v1; count++; }
        if (v2 !== null) { sum += v2; count++; }
        if (v3 !== null) { sum += v3; count++; }
        const avgEl = document.getElementById(baseId + '_avg');
        if (count === 0) { if (avgEl) avgEl.textContent = "---"; return null; }
        let avg = sum / count;
        if (avgEl) avgEl.textContent = avg.toFixed(4);
        return avg;
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
        let t0 = getVal('t0'), p0 = getVal('p0');
        const p0_unit_el = document.getElementById('p0_unit');
        let p0_unit = p0_unit_el ? p0_unit_el.value : 'mbar';
        let t_meas = getVal('t_meas'), p_meas = getVal('p_meas');
        const p_meas_unit_el = document.getElementById('p_meas_unit');
        let p_meas_unit = p_meas_unit_el ? p_meas_unit_el.value : 'mbar';

        if (p0 !== null && p0_unit === 'mbar') p0 = p0 / 10;
        if (p_meas !== null && p_meas_unit === 'mbar') p_meas = p_meas / 10;

        let kTP = 1.0;
        const ktpResultEl = document.getElementById('kTP_result');
        if (t0 !== null && p0 !== null && t_meas !== null && p_meas !== null && p_meas !== 0) {
            kTP = ((273.15 + t_meas) / (273.15 + t0)) * (p0 / p_meas);
            if (ktpResultEl) ktpResultEl.textContent = kTP.toFixed(4);
        } else { if (ktpResultEl) ktpResultEl.textContent = "---"; }

        let m_pos_avg = getAverageGlobal('m_pos'), m_neg_avg = getAverageGlobal('m_neg');
        const routineSelectedEl = document.querySelector('input[name="routine_polarity"]:checked');
        const routineSelected = routineSelectedEl ? routineSelectedEl.value : 'pos';
        let m_routine_avg = (routineSelected === 'pos') ? m_pos_avg : m_neg_avg;

        let kPol = 1.0;
        const kPolResultEl = document.getElementById('kPol_result');
        if (m_pos_avg !== null && m_neg_avg !== null && m_routine_avg !== null && m_routine_avg !== 0) {
            kPol = (Math.abs(m_pos_avg) + Math.abs(m_neg_avg)) / (2 * Math.abs(m_routine_avg));
            if (kPolResultEl) kPolResultEl.textContent = kPol.toFixed(4);
        } else { if (kPolResultEl) kPolResultEl.textContent = "---"; }

        const v1 = getVal('v1'), v2 = getVal('v2');
        let m1_avg = getAverageGlobal('m1'), m2_avg = getAverageGlobal('m2');

        const a_coeffs = {
            "2.0": [2.337, -3.636, 2.299], "2.5": [1.474, -1.587, 1.114],
            "3.0": [1.198, -0.875, 0.677], "3.5": [1.080, -0.542, 0.463],
            "4.0": [1.022, -0.363, 0.341], "5.0": [0.975, -0.188, 0.214]
        };

        let kS = 1.0;
        const vRatioEl = document.getElementById('vRatioDisplay');
        const a0El = document.getElementById('a0_val');
        const a1El = document.getElementById('a1_val');
        const a2El = document.getElementById('a2_val');
        const kSResultEl = document.getElementById('kS_result');

        if (v1 !== null && v2 !== null && v2 !== 0) {
            let ratio = v1 / v2;
            let roundedRatio = (Math.round(ratio * 2) / 2).toFixed(1); 
            if (vRatioEl) vRatioEl.textContent = ratio.toFixed(2);

            let coeffs = a_coeffs[roundedRatio];
            if (coeffs) {
                if (a0El) a0El.textContent = coeffs[0];
                if (a1El) a1El.textContent = coeffs[1];
                if (a2El) a2El.textContent = coeffs[2];
                if (m1_avg !== null && m2_avg !== null && m2_avg !== 0) {
                    let mRatio = m1_avg / m2_avg;
                    kS = coeffs[0] + (coeffs[1] * mRatio) + (coeffs[2] * Math.pow(mRatio, 2));
                    if (kSResultEl) kSResultEl.textContent = kS.toFixed(4);
                } else { if (kSResultEl) kSResultEl.textContent = "---"; }
            } else {
                if (a0El) a0El.textContent = "N/A";
                if (a1El) a1El.textContent = "N/A";
                if (a2El) a2El.textContent = "N/A";
                if (kSResultEl) kSResultEl.textContent = "Out of Bounds (Use V1/V2 = 2 to 5)";
                kS = null; 
            }
        } else {
            if (vRatioEl) vRatioEl.textContent = "--";
            if (kSResultEl) kSResultEl.textContent = "---";
        }

        const kElec = getVal('kelec') || 1.0;
        const ndw = getVal('ndw');
        const numMu = getVal('num_mu');
        const refUnitEl = document.getElementById('refDoseUnit');
        const refDoseUnit = refUnitEl ? refUnitEl.value : 'cGy/MU';
        const tolEl = document.getElementById('toleranceSelect');
        const tolerance = tolEl ? parseFloat(tolEl.value) : 3; 

        const globalFactor = (kTP !== null && kPol !== null && kS !== null) ? (kTP * kElec * kPol * kS) : null;
        const rows = document.querySelectorAll('#doseTable tbody tr');

        rows.forEach(row => {
            const mraw1 = getRowVal(row.querySelector('.inp-mraw1'));
            const mraw2 = getRowVal(row.querySelector('.inp-mraw2'));
            const mraw3 = getRowVal(row.querySelector('.inp-mraw3'));
            const kq = getRowVal(row.querySelector('.inp-kq'));
            const pddTpr = getRowVal(row.querySelector('.inp-pdd'));
            const refOutput = getRowVal(row.querySelector('.inp-ref'));

            let sum = 0, count = 0;
            if (mraw1 !== null) { sum += mraw1; count++; }
            if (mraw2 !== null) { sum += mraw2; count++; }
            if (mraw3 !== null) { sum += mraw3; count++; }
            
            let mraw_avg = null;
            if (count > 0) {
                mraw_avg = sum / count;
                row.querySelector('.mraw-avg-display').textContent = mraw_avg.toFixed(4);
            } else {
                row.querySelector('.mraw-avg-display').textContent = "---";
            }

            let m_corr = (mraw_avg !== null && globalFactor !== null) ? (mraw_avg * globalFactor) : null;

            let dw_zref = null, dw_zmax = null, comparison_val = null;
            if (m_corr !== null && ndw !== null && kq !== null && numMu !== null && numMu !== 0) {
                dw_zref = (m_corr * ndw * kq) / numMu;

                if (pddTpr !== null && pddTpr !== 0) {
                    const setupVal = document.getElementById('setup') ? document.getElementById('setup').value : 'SSD';
                    if (setupVal === 'SSD') {
                        dw_zmax = (dw_zref / pddTpr) * 100;
                    } else {
                        dw_zmax = dw_zref / pddTpr;
                    }

                    if (refDoseUnit === 'cGy/MU') {
                        comparison_val = dw_zmax;
                        row.querySelector('.out-dzmax').textContent = dw_zmax.toFixed(4);
                    } else { 
                        comparison_val = 1 / dw_zmax;
                        row.querySelector('.out-dzmax').textContent = comparison_val.toFixed(4);
                    }
                } else { row.querySelector('.out-dzmax').textContent = "---"; }
            } else { row.querySelector('.out-dzmax').textContent = "---"; }

            if (comparison_val !== null && refOutput !== null && refOutput !== 0) {
                const variation = ((comparison_val - refOutput) / refOutput) * 100;
                const varEl = row.querySelector('.out-var');
                varEl.textContent = variation.toFixed(2);
                varEl.style.color = Math.abs(variation) > tolerance ? '#d9534f' : '#5cb85c';
            } else {
                row.querySelector('.out-var').textContent = "---";
                row.querySelector('.out-var').style.color = "inherit";
            }
        });
    }

    function addEnergyRow() {
        const tbody = document.querySelector('#doseTable tbody');
        if(!tbody) return;
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td>
                <div class="input-with-unit" style="justify-content:center;">
                    <input type="number" step="1" class="row-input inp-energy">
                    <select class="row-input inp-energy-mode">
                        <option value="MV">MV</option>
                        <option value="FFF">FFF</option>
                    </select>
                </div>
            </td>
            <td>
                <div class="mraw-inputs">
                    <input type="number" step="0.01" class="row-input inp-mraw1">
                    <input type="number" step="0.01" class="row-input inp-mraw2">
                    <input type="number" step="0.01" class="row-input inp-mraw3">
                </div>
                <div class="mraw-avg-display">---</div>
            </td>
            <td><input type="number" step="0.01" class="row-input inp-kq"></td>
            <td><input type="number" step="0.01" class="row-input inp-pdd"></td>
            <td><input type="number" step="0.01" class="row-input inp-ref"></td>
            <td class="td-result out-dzmax">---</td>
            <td class="td-result out-var">---</td>
            <td class="no-print"><button class="remove-btn">X</button></td>
        `;
        
        tr.querySelectorAll('.row-input').forEach(inp => inp.addEventListener('input', calculateAllDoses));
        tr.querySelector('.remove-btn').addEventListener('click', () => { tr.remove(); calculateAllDoses(); });
        tbody.appendChild(tr);
    }

    const addRowBtn = document.getElementById('addRowBtn');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', addEnergyRow);
        addEnergyRow(); 
    }

    // ==========================================
    // 3. COMMISSIONING & ADMIN DASHBOARD LOGIC
    // ==========================================

    const worksheetContainer = document.getElementById('worksheet');
    const adminContainer = document.getElementById('admin-container');
    const backToQaBtn = document.getElementById('backToQaBtn');

    // Toggle Views
    if (toggleAdminBtn && adminContainer && worksheetContainer) {
        toggleAdminBtn.addEventListener('click', () => {
            worksheetContainer.style.display = 'none';
            adminContainer.style.display = 'block';
            loadMachinesForDropdown(); // Fetch latest machines from DB for the specific hospital
        });
    }

    if (backToQaBtn && adminContainer && worksheetContainer) {
        backToQaBtn.addEventListener('click', () => {
            adminContainer.style.display = 'none';
            worksheetContainer.style.display = 'block';
        });
    }

    // --- MACHINE COMMISSIONING ---
    const adminAddEnergyBtn = document.getElementById('adminAddEnergyBtn');
    if (adminAddEnergyBtn) {
        adminAddEnergyBtn.addEventListener('click', () => {
            const tbody = document.querySelector('#adminEnergyTable tbody');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="text" class="admin-energy-name"></td>
                <td><input type="number" step="0.001" class="admin-tpr"></td>
                <td><button class="btn admin-remove-btn" style="background: #d9534f; padding: 4px 8px;">X</button></td>
            `;
            tr.querySelector('.admin-remove-btn').addEventListener('click', () => tr.remove());
            tbody.appendChild(tr);
        });
    }

    const saveMachineBtn = document.getElementById('saveMachineBtn');
    if (saveMachineBtn) {
        saveMachineBtn.addEventListener('click', async () => {
            if (!currentHospitalId) return alert("Error: User does not belong to a hospital.");
            const name = document.getElementById('adminMachineName').value;
            if (!name) return alert("Please enter a Machine Name.");

            const energies = [];
            document.querySelectorAll('#adminEnergyTable tbody tr').forEach(row => {
                const eName = row.querySelector('.admin-energy-name').value;
                const tpr = parseFloat(row.querySelector('.admin-tpr').value);
                if (eName && !isNaN(tpr)) {
                    energies.push({ energy: eName, tpr2010: tpr, baselineSet: false });
                }
            });

            if (energies.length === 0) return alert("Please add at least one valid energy.");

            try {
                // ROUTED WRITE: Save inside this specific hospital
                await db.collection('Hospitals').doc(currentHospitalId).collection('Machines').add({
                    name: name,
                    energies: energies,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                alert("Machine successfully commissioned to your Hospital database!");
                document.getElementById('adminMachineName').value = '';
                loadMachinesForDropdown();
            } catch (error) {
                console.error("Error adding machine: ", error);
                alert("Error saving machine. Check console permissions.");
            }
        });
    }


    // --- CHAMBER COMMISSIONING & TRS-398 INTERPOLATION ---
    const trs398Data = {
        "PTW 30013": [
            { tpr: 0.50, kq: 1.000 }, { tpr: 0.53, kq: 0.999 },
            { tpr: 0.56, kq: 0.997 }, { tpr: 0.59, kq: 0.995 },
            { tpr: 0.62, kq: 0.992 }, { tpr: 0.65, kq: 0.989 },
            { tpr: 0.68, kq: 0.985 }, { tpr: 0.71, kq: 0.980 },
            { tpr: 0.74, kq: 0.974 }, { tpr: 0.77, kq: 0.967 },
            { tpr: 0.80, kq: 0.959 }
        ]
    };

    function interpolateKq(model, tprTarget) {
        if (!trs398Data[model]) return 1.000; 
        
        const data = trs398Data[model];
        for (let i = 0; i < data.length - 1; i++) {
            if (tprTarget >= data[i].tpr && tprTarget <= data[i+1].tpr) {
                const slope = (data[i+1].kq - data[i].kq) / (data[i+1].tpr - data[i].tpr);
                const kq = data[i].kq + slope * (tprTarget - data[i].tpr);
                return parseFloat(kq.toFixed(3));
            }
        }
        return 1.000; 
    }

    let currentMachines = [];
    async function loadMachinesForDropdown() {
        if (!currentHospitalId) return;
        const select = document.getElementById('adminTargetMachine');
        if (!select) return;
        select.innerHTML = '<option value="">-- Select Machine --</option>';
        currentMachines = [];

        // ROUTED READ: Only get machines for this specific hospital
        try {
            const snapshot = await db.collection('Hospitals').doc(currentHospitalId).collection('Machines').get();
            snapshot.forEach(doc => {
                const machine = { id: doc.id, ...doc.data() };
                currentMachines.push(machine);
                const option = document.createElement('option');
                option.value = machine.id;
                option.textContent = machine.name;
                select.appendChild(option);
            });
        } catch(e) { console.log("Could not load machines (permissions?)", e); }
    }

    let calculatedKqFactors = {};
    const targetMachineSelect = document.getElementById('adminTargetMachine');
    if (targetMachineSelect) {
        targetMachineSelect.addEventListener('change', (e) => {
            const machineId = e.target.value;
            const model = document.getElementById('adminChamberModel').value || "PTW 30013"; 
            const kqSection = document.getElementById('chamberKqSection');
            const resultsDiv = document.getElementById('chamberKqResults');
            
            calculatedKqFactors = {};
            resultsDiv.innerHTML = '';

            if (!machineId) {
                kqSection.style.display = 'none';
                return;
            }

            const machine = currentMachines.find(m => m.id === machineId);
            if(machine && machine.energies) {
                machine.energies.forEach(eng => {
                    const kq = interpolateKq(model, eng.tpr2010);
                    calculatedKqFactors[eng.energy] = kq;
                    
                    resultsDiv.innerHTML += `
                        <div style="background: white; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">
                            <strong>${eng.energy}</strong><br>
                            TPR: ${eng.tpr2010} &rarr; <strong>k<sub>Q</sub>: ${kq}</strong>
                        </div>
                    `;
                });
                kqSection.style.display = 'block';
            }
        });
    }

    const saveChamberBtn = document.getElementById('saveChamberBtn');
    if (saveChamberBtn) {
        saveChamberBtn.addEventListener('click', async () => {
            if (!currentHospitalId) return alert("Error: User does not belong to a hospital.");
            const model = document.getElementById('adminChamberModel').value;
            const serial = document.getElementById('adminChamberSerial').value;
            const ndw = parseFloat(document.getElementById('adminChamberNdw').value);
            const machineId = document.getElementById('adminTargetMachine').value;

            if (!model || !serial || isNaN(ndw) || !machineId) {
                return alert("Please fill out all chamber details and select a machine.");
            }

            try {
                // ROUTED WRITE: Save inside this specific hospital
                await db.collection('Hospitals').doc(currentHospitalId).collection('Chambers').add({
                    model: model,
                    serial: serial,
                    ndw: ndw,
                    targetMachineId: machineId,
                    kqFactors: calculatedKqFactors,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                alert("Chamber successfully commissioned and mapped to machine!");
                document.getElementById('adminChamberModel').value = '';
                document.getElementById('adminChamberSerial').value = '';
                document.getElementById('adminChamberNdw').value = '';
                document.getElementById('chamberKqSection').style.display = 'none';
                document.getElementById('adminTargetMachine').value = '';
            } catch (error) {
                console.error("Error adding chamber: ", error);
                alert("Error saving chamber. Check console permissions.");
            }
        });
    }


    // ==========================================
    // 4. PDF GENERATION WITH IsoCentre BRANDING
    // ==========================================

    const generatePdfBtn = document.getElementById('generatePdfBtn');
    if (generatePdfBtn) {
        generatePdfBtn.addEventListener('click', () => {
            
            const therapyUnit = getText('therapyUnit');
            let phant = document.getElementById('phantomSelect') ? document.getElementById('phantomSelect').value : 'Water';
            if(phant === 'Other') phant = getText('phantomOther');
            const setupValEl = document.getElementById('setup');
            const setup = setupValEl ? setupValEl.value : 'SSD';
            const zref = getText('zref');
            const fSize = getText('fieldSize');
            const mu = getText('num_mu');

            const kTP_el = document.getElementById('kTP_result');
            const kTP = kTP_el ? kTP_el.textContent : '---';
            const kPol_el = document.getElementById('kPol_result');
            const kPol = kPol_el ? kPol_el.textContent : '---';
            const kS_el = document.getElementById('kS_result');
            const kS = kS_el ? kS_el.textContent : '---';
            const kElec = getText('kelec');

            const pddOrTpr = setup === 'SSD' ? 'PDD (%)' : 'TPR';
            const refUnitEl = document.getElementById('refDoseUnit');
            const refUnit = refUnitEl ? refUnitEl.value : 'cGy/MU';

            // --- FULL, PERFECT SVG LOGO ---
            const whiteIsoLogo = `
                <svg viewBox="0 0 140 30" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="15" cy="15" r="10" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.4"/>
                    <line x1="15" y1="2" x2="15" y2="28" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="2 2" opacity="0.7"/>
                    <line x1="2" y1="15" x2="28" y2="15" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="2 2" opacity="0.7"/>
                    <circle cx="15" cy="15" r="3.5" fill="#00d2ff" />
                    <text x="35" y="21" font-family="Arial, sans-serif" font-size="18" fill="#ffffff" font-weight="bold" letter-spacing="0.5">Iso<tspan font-weight="normal" fill="#aaccff">Centre</tspan></text>
                </svg>`;

            // --- PDF Tables Construction ---
            let p0Unit = document.getElementById('p0_unit') ? document.getElementById('p0_unit').value : 'mbar';
            let pMeasUnit = document.getElementById('p_meas_unit') ? document.getElementById('p_meas_unit').value : 'mbar';
            
            let ktpTable = {
                widths: ['auto', 'auto'],
                body: [
                    [{text: 'Parameter', style: 'th'}, {text: 'Value', style: 'th'}],
                    [{text: 'T0 [°C]', style: 'label'}, {text: getText('t0'), style: 'cell'}],
                    [{text: `P0 [${p0Unit}]`, style: 'label'}, {text: getText('p0'), style: 'cell'}],
                    [{text: 'Measured T [°C]', style: 'label'}, {text: getText('t_meas'), style: 'cell'}],
                    [{text: `Measured P [${pMeasUnit}]`, style: 'label'}, {text: getText('p_meas'), style: 'cell'}],
                    [{text: 'k_TP', style: 'label'}, {text: kTP, style: 'cell', bold: true}]
                ]
            };

            let posArr = getReadingsArray('m_pos');
            let negArr = getReadingsArray('m_neg');
            let polCols = Math.max(posArr.length, negArr.length, 0);
            let polHeader = [{text: 'Polarity', style: 'th'}];
            for(let i=1; i<=polCols; i++) { polHeader.push({text: `Rdg ${i}`, style: 'th'}); }
            polHeader.push({text: 'Avg', style: 'th'});

            let posRow = [{text: 'Positive (+)', style: 'label'}];
            for(let i=0; i<polCols; i++) { posRow.push({text: posArr[i] !== undefined ? posArr[i] : '---', style: 'cell'}); }
            const mPosAvgEl = document.getElementById('m_pos_avg');
            posRow.push({text: mPosAvgEl ? mPosAvgEl.textContent : '---', style: 'cell'});

            let negRow = [{text: 'Negative (-)', style: 'label'}];
            for(let i=0; i<polCols; i++) { negRow.push({text: negArr[i] !== undefined ? negArr[i] : '---', style: 'cell'}); }
            const mNegAvgEl = document.getElementById('m_neg_avg');
            negRow.push({text: mNegAvgEl ? mNegAvgEl.textContent : '---', style: 'cell'});

            let kPolResultRow = [
                {text: 'k_pol =', colSpan: polCols + 1, style: 'label', alignment: 'right'}, 
                ...Array(polCols).fill(''), 
                {text: kPol, style: 'cell', bold: true}
            ];

            let polTable = {
                widths: Array(polHeader.length).fill('auto'),
                body: [ polHeader, posRow, negRow, kPolResultRow ]
            };

            let m1Arr = getReadingsArray('m1');
            let m2Arr = getReadingsArray('m2');
            let ksCols = Math.max(m1Arr.length, m2Arr.length, 0);
            let ksHeader = [{text: 'Voltage [V]', style: 'th'}];
            for(let i=1; i<=ksCols; i++) { ksHeader.push({text: `Rdg ${i}`, style: 'th'}); }
            ksHeader.push({text: 'Avg', style: 'th'});

            let ksRow1 = [{text: `Normal (${getText('v1')}V)`, style:'label'}];
            for(let i=0; i<ksCols; i++) { ksRow1.push({text: m1Arr[i] !== undefined ? m1Arr[i] : '---', style: 'cell'}); }
            const m1AvgEl = document.getElementById('m1_avg');
            ksRow1.push({text: m1AvgEl ? m1AvgEl.textContent : '---', style:'cell'});

            let ksRow2 = [{text: `Reduced (${getText('v2')}V)`, style:'label'}];
            for(let i=0; i<ksCols; i++) { ksRow2.push({text: m2Arr[i] !== undefined ? m2Arr[i] : '---', style: 'cell'}); }
            const m2AvgEl = document.getElementById('m2_avg');
            ksRow2.push({text: m2AvgEl ? m2AvgEl.textContent : '---', style:'cell'});

            let ksResultRow = [
                {text: 'k_s =', colSpan: ksCols + 1, style: 'label', alignment: 'right'}, 
                ...Array(ksCols).fill(''), 
                {text: kS, style: 'cell', bold: true}
            ];

            let ksTable = {
                widths: Array(ksHeader.length).fill('auto'),
                body: [ ksHeader, ksRow1, ksRow2, ksResultRow ]
            };

            const a0El = document.getElementById('a0_val');
            const a1El = document.getElementById('a1_val');
            const a2El = document.getElementById('a2_val');
            let coeffsTable = {
                widths: ['auto', 'auto', 'auto'],
                body: [
                    [{text: 'a0', style: 'th'}, {text: 'a1', style: 'th'}, {text: 'a2', style: 'th'}],
                    [{text: a0El ? a0El.textContent : '---', style: 'cell'},
                     {text: a1El ? a1El.textContent : '---', style: 'cell'},
                     {text: a2El ? a2El.textContent : '---', style: 'cell'}]
                ]
            };

            let finalRowsData = [];
            let maxFinalCols = 0;
            
            document.querySelectorAll('#doseTable tbody tr').forEach(row => {
                let mraw1 = getRowVal(row.querySelector('.inp-mraw1'));
                let mraw2 = getRowVal(row.querySelector('.inp-mraw2'));
                let mraw3 = getRowVal(row.querySelector('.inp-mraw3'));
                let arr = [];
                if(mraw1 !== null) arr.push(mraw1);
                if(mraw2 !== null) arr.push(mraw2);
                if(mraw3 !== null) arr.push(mraw3);
                if(arr.length > maxFinalCols) maxFinalCols = arr.length;

                finalRowsData.push({ rowEl: row, arr: arr });
            });

            let finalHeader = [{text: 'Energy', style: 'th'}];
            for(let i=1; i<=maxFinalCols; i++) { finalHeader.push({text: `M_raw ${i}`, style: 'th'}); }
            finalHeader.push(
                {text: 'Avg\nM_raw', style: 'th'},
                {text: 'kQ', style: 'th'},
                {text: pddOrTpr, style: 'th'},
                {text: `Ref Output\n[${refUnit}]`, style: 'th'},
                {text: `Dw(Zmax)\n[${refUnit}]`, style: 'th'},
                {text: 'Var (%)', style: 'th'}
            );

            let resultsTableBody = [finalHeader];

            finalRowsData.forEach(data => {
                let row = data.rowEl;
                let arr = data.arr;

                let energyObj = row.querySelector('.inp-energy');
                let energy = energyObj ? energyObj.value : '';
                let modeObj = row.querySelector('.inp-energy-mode');
                let mode = modeObj ? modeObj.value : '';
                let engStr = energy ? `${energy} ${mode}` : '---';
                let mrawAvgObj = row.querySelector('.mraw-avg-display');
                let mraw_avg = mrawAvgObj ? mrawAvgObj.textContent : '---';
                let kqObj = row.querySelector('.inp-kq');
                let kq = (kqObj && kqObj.value) ? kqObj.value : '---';
                let pddObj = row.querySelector('.inp-pdd');
                let pdd = (pddObj && pddObj.value) ? pddObj.value : '---';
                let refObj = row.querySelector('.inp-ref');
                let ref = (refObj && refObj.value) ? refObj.value : '---';
                let dzmaxObj = row.querySelector('.out-dzmax');
                let dzmax = dzmaxObj ? dzmaxObj.textContent : '---';
                let varObj = row.querySelector('.out-var');
                let variation = varObj ? varObj.textContent : '---';
                
                const varColor = (varObj && varObj.style.color === 'rgb(217, 83, 79)') ? '#d9534f' : 
                                 (varObj && varObj.style.color === 'rgb(92, 184, 92)') ? '#5cb85c' : '#333';

                let pdfRow = [{text: engStr, style: 'label'}];
                for(let i=0; i<maxFinalCols; i++) { pdfRow.push({text: arr[i] !== undefined ? arr[i] : '---', style: 'cell'}); }
                pdfRow.push(
                    {text: mraw_avg, style: 'label'},
                    {text: kq, style: 'cell'}, {text: pdd, style: 'cell'}, {text: ref, style: 'cell'},
                    {text: dzmax, bold: true, alignment: 'center'}, 
                    {text: variation, bold: true, color: varColor, alignment: 'center'}
                );
                resultsTableBody.push(pdfRow);
            });

            // --- Document Definition ---
            const docDefinition = {
                pageSize: 'A4',
                pageOrientation: 'landscape',
                pageMargins: [40, 40, 40, 50], // Base margins 

                // --- THE ABSOLUTE POSITIONING FIX ---
                footer: function(currentPage, pageCount, pageSize) {
                    return [
                        {
                            canvas: [
                                { type: 'rect', x: 0, y: 0, w: pageSize.width, h: 32, color: '#0056b3' }
                            ],
                            absolutePosition: { x: 0, y: pageSize.height - 32 }
                        },
                        {
                            columns: [
                                { svg: whiteIsoLogo, width: 95, alignment: 'left' },
                                { svg: whiteIsoLogo, width: 95, alignment: 'center' },
                                { svg: whiteIsoLogo, width: 95, alignment: 'right' }
                            ],
                            absolutePosition: { x: 40, y: pageSize.height - 27 }, 
                            width: pageSize.width - 80 
                        }
                    ];
                },

                styles: {
                    title: { fontSize: 16, bold: true, color: '#0056b3', alignment: 'center', margin: [0, 0, 0, 5] },
                    subtitle: { fontSize: 12, alignment: 'center', margin: [0, 0, 0, 20] },
                    sectionHeader: { fontSize: 13, bold: true, color: '#0056b3', margin: [0, 15, 0, 8] },
                    th: { bold: true, fillColor: '#eef2f5', color: '#0056b3', alignment: 'center', margin: [0,4,0,4] },
                    cell: { margin: [0,4,0,4], alignment: 'center' },
                    label: { bold: true, color: '#333', alignment: 'center', margin: [0,4,0,4] },
                    tableWrapper: { margin: [0, 5, 0, 15] }
                },
                content: [
                    {
                        columns: [
                            logoBase64 ? { image: logoBase64, width: 80, alignment: 'left' } : { text: '', width: 80 },
                            {
                                width: '*',
                                text: [
                                    { text: `REPORT ON OUTPUT MEASUREMENT OF ${therapyUnit.toUpperCase() || 'THERAPY UNIT'}\n`, style: 'title' },
                                    { text: `Date: ${document.getElementById('date').value || '---'}`, style: 'subtitle' }
                                ]
                            },
                            { width: 80, text: '' } 
                        ],
                        margin: [0, 0, 0, 20]
                    },
                    {
                        pageBreak: 'avoid',
                        columns: [
                            {
                                width: '48%',
                                table: {
                                    widths: ['50%', '50%'],
                                    body: [
                                        [{text: '1. Measurement Conditions', colSpan: 2, style: 'th'}, {}],
                                        [{text: 'Phantom', style: 'label'}, {text: phant, style: 'cell'}],
                                        [{text: 'Setup', style: 'label'}, {text: setup, style: 'cell'}],
                                        [{text: 'Zref [g/cm²]', style: 'label'}, {text: zref, style: 'cell'}],
                                        [{text: 'Field Size [cm x cm]', style: 'label'}, {text: fSize, style: 'cell'}],
                                        [{text: 'No. of MU', style: 'label'}, {text: mu, style: 'cell'}]
                                    ]
                                }
                            },
                            { width: '4%', text: '' },
                            {
                                width: '48%',
                                table: {
                                    widths: ['50%', '50%'],
                                    body: [
                                        [{text: '2. Dosimetry Equipment', colSpan: 2, style: 'th'}, {}],
                                        [{text: 'Chamber Model (SN)', style: 'label'}, {text: `${getText('chamberModel')} (${getText('chamberSerial')})`, style: 'cell'}],
                                        [{text: 'N_D,w [cGy/nC]', style: 'label'}, {text: getText('ndw'), style: 'cell'}],
                                        [{text: 'Calibration Lab', style: 'label'}, {text: getText('calLab'), style: 'cell'}],
                                        [{text: 'Electrometer (SN)', style: 'label'}, {text: `${getText('elecModel')} (${getText('elecSerial')})`, style: 'cell'}]
                                    ]
                                }
                            }
                        ]
                    },
                    { text: '3. Applied Correction Factors', style: 'sectionHeader', pageBreak: 'avoid' },
                    {
                        columns: [
                            { width: 'auto', margin: [0,0,15,0], pageBreak: 'avoid', table: ktpTable },
                            { width: 'auto', margin: [0,0,15,0], pageBreak: 'avoid', table: polTable },
                            {
                                width: 'auto',
                                pageBreak: 'avoid',
                                table: {
                                    widths: ['auto', 'auto'],
                                    body: [
                                        [{text: 'Factor', style: 'th'}, {text: 'Value', style: 'th'}],
                                        [{text: 'k_elec', style: 'label'}, {text: getText('kelec'), style: 'cell'}]
                                    ]
                                }
                            }
                        ]
                    },
                    {
                        pageBreak: 'avoid',
                        margin: [0, 15, 0, 0],
                        columns: [ { width: 'auto', table: ksTable } ]
                    },
                    {
                        pageBreak: 'avoid',
                        margin: [0, 5, 0, 15],
                        columns: [ { width: 'auto', table: coeffsTable } ]
                    },
                    { text: '4. Absorbed Dose to Water Results', style: 'sectionHeader', pageBreak: 'avoid' },
                    {
                        pageBreak: 'avoid',
                        table: {
                            headerRows: 1,
                            widths: Array(finalHeader.length).fill('auto'), 
                            body: resultsTableBody
                        }
                    },
                    {
                        pageBreak: 'avoid',
                        columns: [
                            {
                                text: `Performed by:\n\n\n___________________________\n${getText('userName')}`,
                                alignment: 'left',
                                margin: [0, 50, 0, 0]
                            },
                            {
                                text: `Incharge Medical Physicist/RSO:\n\n\n___________________________\n`,
                                alignment: 'right',
                                margin: [0, 50, 0, 0]
                            }
                        ]
                    }
                ]
            };

            let filenameDate = document.getElementById('date') ? document.getElementById('date').value : 'Date';
            let filename = `${therapyUnit.replace(/[^a-z0-9]/gi, '_') || 'Unit'}_${filenameDate}.pdf`;
            pdfMake.createPdf(docDefinition).download(filename);
        });
    }
});
