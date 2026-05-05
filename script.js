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

    // Auth State Observer
    auth.onAuthStateChanged((user) => {
        if (user) {
            loginContainer.style.display = 'none';
            appContainer.style.display = 'block';
            document.getElementById('navUserName').textContent = user.email;
        } else {
            appContainer.style.display = 'none';
            loginContainer.style.display = 'block';
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
    // 2. CALCULATOR LOGIC
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
    setupSelect.addEventListener('change', updateSetupLabels);

    const phantomSelect = document.getElementById('phantomSelect');
    const phantomOther = document.getElementById('phantomOther');
    phantomSelect.addEventListener('change', () => {
        phantomOther.style.display = phantomSelect.value === 'Other' ? 'block' : 'none';
    });

    const mPosInputs = [document.getElementById('m_pos_1'), document.getElementById('m_pos_2'), document.getElementById('m_pos_3')];
    const mNegInputs = [document.getElementById('m_neg_1'), document.getElementById('m_neg_2'), document.getElementById('m_neg_3')];
    const m1Inputs = [document.getElementById('m1_1'), document.getElementById('m1_2'), document.getElementById('m1_3')];
    const routineRadios = document.getElementsByName('routine_polarity');

    function syncRoutineToM1() {
        let activeInputs = document.querySelector('input[name="routine_polarity"]:checked').value === 'pos' ? mPosInputs : mNegInputs;
        for(let i=0; i<3; i++){ m1Inputs[i].value = activeInputs[i].value; }
        calculateAllDoses();
    }
    function syncM1ToRoutine() {
        let activeInputs = document.querySelector('input[name="routine_polarity"]:checked').value === 'pos' ? mPosInputs : mNegInputs;
        for(let i=0; i<3; i++){ activeInputs[i].value = m1Inputs[i].value; }
        calculateAllDoses();
    }

    mPosInputs.forEach(input => input.addEventListener('input', () => {
        if(document.querySelector('input[name="routine_polarity"]:checked').value === 'pos') syncRoutineToM1();
    }));
    mNegInputs.forEach(input => input.addEventListener('input', () => {
        if(document.querySelector('input[name="routine_polarity"]:checked').value === 'neg') syncRoutineToM1();
    }));
    m1Inputs.forEach(input => input.addEventListener('input', syncM1ToRoutine));
    routineRadios.forEach(radio => radio.addEventListener('change', syncRoutineToM1));

    document.querySelectorAll('.worksheet-section input:not(.row-input), .worksheet-section select:not(.row-input)').forEach(input => {
        input.addEventListener('input', calculateAllDoses);
        input.addEventListener('change', calculateAllDoses);
    });

    document.getElementById('refDoseUnit').addEventListener('change', () => {
        const unit = document.getElementById('refDoseUnit').value;
        document.getElementById('th-ref-unit').textContent = `[${unit}]`;
        document.getElementById('th-dzmax-unit').textContent = `[${unit}]`;
        calculateAllDoses();
    });
    document.getElementById('toleranceSelect').addEventListener('change', calculateAllDoses);

    function getVal(id) { const val = parseFloat(document.getElementById(id).value); return isNaN(val) ? null : val; }
    function getText(id) { return document.getElementById(id).value || '---'; }
    function getRowVal(inputObj) { const val = parseFloat(inputObj.value); return isNaN(val) ? null : val; }

    function getAverageGlobal(baseId) {
        let v1 = getVal(baseId + '_1'), v2 = getVal(baseId + '_2'), v3 = getVal(baseId + '_3');
        let sum = 0, count = 0;
        if (v1 !== null) { sum += v1; count++; }
        if (v2 !== null) { sum += v2; count++; }
        if (v3 !== null) { sum += v3; count++; }
        if (count === 0) { document.getElementById(baseId + '_avg').textContent = "---"; return null; }
        let avg = sum / count;
        document.getElementById(baseId + '_avg').textContent = avg.toFixed(4);
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
        const routineSelected = document.querySelector('input[name="routine_polarity"]:checked').value;
        let m_routine_avg = (routineSelected === 'pos') ? m_pos_avg : m_neg_avg;

        let kPol = 1.0;
        if (m_pos_avg !== null && m_neg_avg !== null && m_routine_avg !== null && m_routine_avg !== 0) {
            kPol = (Math.abs(m_pos_avg) + Math.abs(m_neg_avg)) / (2 * Math.abs(m_routine_avg));
            document.getElementById('kPol_result').textContent = kPol.toFixed(4);
        } else { document.getElementById('kPol_result').textContent = "---"; }

        const v1 = getVal('v1'), v2 = getVal('v2');
        let m1_avg = getAverageGlobal('m1'), m2_avg = getAverageGlobal('m2');

        const a_coeffs = {
            "2.0": [2.337, -3.636, 2.299], "2.5": [1.474, -1.587, 1.114],
            "3.0": [1.198, -0.875, 0.677], "3.5": [1.080, -0.542, 0.463],
            "4.0": [1.022, -0.363, 0.341], "5.0": [0.975, -0.188, 0.214]
        };

        let kS = 1.0;
        if (v1 !== null && v2 !== null && v2 !== 0) {
            let ratio = v1 / v2;
            let roundedRatio = (Math.round(ratio * 2) / 2).toFixed(1); 
            document.getElementById('vRatioDisplay').textContent = ratio.toFixed(2);

            let coeffs = a_coeffs[roundedRatio];
            if (coeffs) {
                document.getElementById('a0_val').textContent = coeffs[0];
                document.getElementById('a1_val').textContent = coeffs[1];
                document.getElementById('a2_val').textContent = coeffs[2];
                if (m1_avg !== null && m2_avg !== null && m2_avg !== 0) {
                    let mRatio = m1_avg / m2_avg;
                    kS = coeffs[0] + (coeffs[1] * mRatio) + (coeffs[2] * Math.pow(mRatio, 2));
                    document.getElementById('kS_result').textContent = kS.toFixed(4);
                } else { document.getElementById('kS_result').textContent = "---"; }
            } else {
                document.getElementById('a0_val').textContent = "N/A";
                document.getElementById('a1_val').textContent = "N/A";
                document.getElementById('a2_val').textContent = "N/A";
                document.getElementById('kS_result').textContent = "Out of Bounds (Use V1/V2 = 2 to 5)";
                kS = null; 
            }
        } else {
            document.getElementById('vRatioDisplay').textContent = "--";
            document.getElementById('kS_result').textContent = "---";
        }

        const kElec = getVal('kelec') || 1.0;
        const ndw = getVal('ndw');
        const numMu = getVal('num_mu');
        const refDoseUnit = document.getElementById('refDoseUnit').value;
        const tolerance = parseFloat(document.getElementById('toleranceSelect').value); 

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
                    if (document.getElementById('setup').value === 'SSD') {
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

    document.getElementById('addRowBtn').addEventListener('click', addEnergyRow);
    addEnergyRow(); 


    // ==========================================
    // 3. PDF GENERATION WITH IsoCentre BRANDING
    // ==========================================

    document.getElementById('generatePdfBtn').addEventListener('click', () => {
        
        const therapyUnit = getText('therapyUnit');
        let phant = document.getElementById('phantomSelect').value;
        if(phant === 'Other') phant = getText('phantomOther');
        const setup = document.getElementById('setup').value;
        const zref = getText('zref');
        const fSize = getText('fieldSize');
        const mu = getText('num_mu');

        const kTP = document.getElementById('kTP_result').textContent;
        const kPol = document.getElementById('kPol_result').textContent;
        const kS = document.getElementById('kS_result').textContent;
        const kElec = getText('kelec');

        const pddOrTpr = setup === 'SSD' ? 'PDD (%)' : 'TPR';
        const refUnit = document.getElementById('refDoseUnit').value;

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
        let ktpTable = {
            widths: ['auto', 'auto'],
            body: [
                [{text: 'Parameter', style: 'th'}, {text: 'Value', style: 'th'}],
                [{text: 'T0 [°C]', style: 'label'}, {text: getText('t0'), style: 'cell'}],
                [{text: `P0 [${document.getElementById('p0_unit').value}]`, style: 'label'}, {text: getText('p0'), style: 'cell'}],
                [{text: 'Measured T [°C]', style: 'label'}, {text: getText('t_meas'), style: 'cell'}],
                [{text: `Measured P [${document.getElementById('p_meas_unit').value}]`, style: 'label'}, {text: getText('p_meas'), style: 'cell'}],
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
        posRow.push({text: document.getElementById('m_pos_avg').textContent, style: 'cell'});

        let negRow = [{text: 'Negative (-)', style: 'label'}];
        for(let i=0; i<polCols; i++) { negRow.push({text: negArr[i] !== undefined ? negArr[i] : '---', style: 'cell'}); }
        negRow.push({text: document.getElementById('m_neg_avg').textContent, style: 'cell'});

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
        ksRow1.push({text: document.getElementById('m1_avg').textContent, style:'cell'});

        let ksRow2 = [{text: `Reduced (${getText('v2')}V)`, style:'label'}];
        for(let i=0; i<ksCols; i++) { ksRow2.push({text: m2Arr[i] !== undefined ? m2Arr[i] : '---', style: 'cell'}); }
        ksRow2.push({text: document.getElementById('m2_avg').textContent, style:'cell'});

        let ksResultRow = [
            {text: 'k_s =', colSpan: ksCols + 1, style: 'label', alignment: 'right'}, 
            ...Array(ksCols).fill(''), 
            {text: kS, style: 'cell', bold: true}
        ];

        let ksTable = {
            widths: Array(ksHeader.length).fill('auto'),
            body: [ ksHeader, ksRow1, ksRow2, ksResultRow ]
        };

        let coeffsTable = {
            widths: ['auto', 'auto', 'auto'],
            body: [
                [{text: 'a0', style: 'th'}, {text: 'a1', style: 'th'}, {text: 'a2', style: 'th'}],
                [{text: document.getElementById('a0_val').textContent, style: 'cell'},
                 {text: document.getElementById('a1_val').textContent, style: 'cell'},
                 {text: document.getElementById('a2_val').textContent, style: 'cell'}]
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

            let energy = row.querySelector('.inp-energy').value;
            let mode = row.querySelector('.inp-energy-mode').value;
            let engStr = energy ? `${energy} ${mode}` : '---';
            let mraw_avg = row.querySelector('.mraw-avg-display').textContent;
            let kq = row.querySelector('.inp-kq').value || '---';
            let pdd = row.querySelector('.inp-pdd').value || '---';
            let ref = row.querySelector('.inp-ref').value || '---';
            let dzmax = row.querySelector('.out-dzmax').textContent;
            let varObj = row.querySelector('.out-var');
            let variation = varObj.textContent;
            
            const varColor = (varObj.style.color === 'rgb(217, 83, 79)') ? '#d9534f' : 
                             (varObj.style.color === 'rgb(92, 184, 92)') ? '#5cb85c' : '#333';

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
            // This completely bypasses the buggy table engine by drawing directly onto the page canvas
            footer: function(currentPage, pageCount, pageSize) {
                return [
                    // 1. Draw the blue bar covering the entire physical width of the bottom
                    {
                        canvas: [
                            { type: 'rect', x: 0, y: 0, w: pageSize.width, h: 32, color: '#0056b3' }
                        ],
                        absolutePosition: { x: 0, y: pageSize.height - 32 }
                    },
                    // 2. Place the logos exactly within the document's side margins
                    {
                        columns: [
                            { svg: whiteIsoLogo, width: 95, alignment: 'left' },
                            { svg: whiteIsoLogo, width: 95, alignment: 'center' },
                            { svg: whiteIsoLogo, width: 95, alignment: 'right' }
                        ],
                        // x: 40 perfectly aligns with your text's left margin. 
                        // y: adjusts vertical centering inside the 32px blue bar.
                        absolutePosition: { x: 40, y: pageSize.height - 27 }, 
                        // By forcing the exact width (total page minus both 40px margins), 
                        // the right-aligned logo will physically lock to the exact right text margin!
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
                // --- Header (Dark Logo Removed & Balanced) ---
                {
                    columns: [
                        // Left: Hospital Logo
                        logoBase64 ? { image: logoBase64, width: 80, alignment: 'left' } : { text: '', width: 80 },
                        
                        // Center: Title Text
                        {
                            width: '*',
                            text: [
                                { text: `REPORT ON OUTPUT MEASUREMENT OF ${therapyUnit.toUpperCase() || 'THERAPY UNIT'}\n`, style: 'title' },
                                { text: `Date: ${document.getElementById('date').value || '---'}`, style: 'subtitle' }
                            ]
                        },
                        
                        // Right: Empty spacer to perfectly mirror the left image, keeping title dead center
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

        let filename = `${therapyUnit.replace(/[^a-z0-9]/gi, '_') || 'Unit'}_${document.getElementById('date').value || 'Date'}.pdf`;
        pdfMake.createPdf(docDefinition).download(filename);
    });
});
// ==========================================
    // 4. COMMISSIONING & ADMIN DASHBOARD LOGIC
    // ==========================================

    const worksheetContainer = document.getElementById('worksheet');
    const adminContainer = document.getElementById('admin-container');
    const toggleAdminBtn = document.getElementById('toggleAdminBtn');
    const backToQaBtn = document.getElementById('backToQaBtn');

    // Toggle Views
    toggleAdminBtn.addEventListener('click', () => {
        worksheetContainer.style.display = 'none';
        adminContainer.style.display = 'block';
        loadMachinesForDropdown(); // Fetch latest machines from DB
    });

    backToQaBtn.addEventListener('click', () => {
        adminContainer.style.display = 'none';
        worksheetContainer.style.display = 'block';
    });

    // --- MACHINE COMMISSIONING ---
    document.getElementById('adminAddEnergyBtn').addEventListener('click', () => {
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

    document.getElementById('saveMachineBtn').addEventListener('click', async () => {
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
            await db.collection('machines').add({
                name: name,
                energies: energies,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("Machine successfully commissioned to database!");
            document.getElementById('adminMachineName').value = '';
            loadMachinesForDropdown();
        } catch (error) {
            console.error("Error adding machine: ", error);
            alert("Error saving machine. Check console.");
        }
    });


    // --- CHAMBER COMMISSIONING & TRS-398 INTERPOLATION ---
    
    // Mini TRS-398 Lookup Table (Extend this later!)
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
        // If we don't have the table for this model, return 1.000 (Manual entry required later)
        if (!trs398Data[model]) return 1.000; 
        
        const data = trs398Data[model];
        // Simple linear interpolation
        for (let i = 0; i < data.length - 1; i++) {
            if (tprTarget >= data[i].tpr && tprTarget <= data[i+1].tpr) {
                const slope = (data[i+1].kq - data[i].kq) / (data[i+1].tpr - data[i].tpr);
                const kq = data[i].kq + slope * (tprTarget - data[i].tpr);
                return parseFloat(kq.toFixed(3));
            }
        }
        return 1.000; // Out of bounds
    }

    // Load Machines into Chamber Dropdown
    let currentMachines = [];
    async function loadMachinesForDropdown() {
        const select = document.getElementById('adminTargetMachine');
        select.innerHTML = '<option value="">-- Select Machine --</option>';
        currentMachines = [];

        const snapshot = await db.collection('machines').get();
        snapshot.forEach(doc => {
            const machine = { id: doc.id, ...doc.data() };
            currentMachines.push(machine);
            const option = document.createElement('option');
            option.value = machine.id;
            option.textContent = machine.name;
            select.appendChild(option);
        });
    }

    // When a machine is selected, calculate kQ for its energies
    let calculatedKqFactors = {};
    document.getElementById('adminTargetMachine').addEventListener('change', (e) => {
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
    });

    document.getElementById('saveChamberBtn').addEventListener('click', async () => {
        const model = document.getElementById('adminChamberModel').value;
        const serial = document.getElementById('adminChamberSerial').value;
        const ndw = parseFloat(document.getElementById('adminChamberNdw').value);
        const machineId = document.getElementById('adminTargetMachine').value;

        if (!model || !serial || isNaN(ndw) || !machineId) {
            return alert("Please fill out all chamber details and select a machine.");
        }

        try {
            await db.collection('chambers').add({
                model: model,
                serial: serial,
                ndw: ndw,
                targetMachineId: machineId,
                kqFactors: calculatedKqFactors, // Saves the interpolated kQ dictionary!
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("Chamber successfully commissioned and mapped to machine!");
            document.getElementById('adminChamberModel').value = '';
            document.getElementById('adminChamberSerial').value = '';
            document.getElementById('adminChamberNdw').value = '';
            document.getElementById('chamberKqSection').style.display = 'none';
        } catch (error) {
            console.error("Error adding chamber: ", error);
        }
    });
