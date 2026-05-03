document.addEventListener('DOMContentLoaded', () => {
    
    // --- 0. Logo Upload Handling for PDF ---
    let logoBase64 = null;
    document.getElementById('logoInput').addEventListener('change', function(e) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onloadend = function() {
            logoBase64 = reader.result;
        }
        if(file) reader.readAsDataURL(file);
    });

    // --- 1. Setup Logic (Toggle PDD vs TPR labels) ---
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

    // --- 3. Bi-Directional Sync: Routine M <--> M1 ---
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

    // Attach global calculation triggers
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

    // Helpers
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

    // --- Main Calculation ---
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
        const tolerance = parseFloat(document.getElementById('toleranceSelect').value); // 2 or 3

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

    // Dynamic Row Addition
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
            <td><button class="remove-btn">X</button></td>
        `;
        
        tr.querySelectorAll('.row-input').forEach(inp => inp.addEventListener('input', calculateAllDoses));
        tr.querySelector('.remove-btn').addEventListener('click', () => { tr.remove(); calculateAllDoses(); });
        tbody.appendChild(tr);
    }

    document.getElementById('addRowBtn').addEventListener('click', addEnergyRow);
    addEnergyRow();

    // --- PDFMAKE Custom PDF Generation ---
    document.getElementById('generatePdfBtn').addEventListener('click', () => {
        
        // 1. Gather Data
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

        // 2. Build the Results Table Array
        const resultsTableBody = [
            [
                { text: 'Energy', style: 'th' },
                { text: 'Avg Mraw', style: 'th' },
                { text: 'kQ', style: 'th' },
                { text: pddOrTpr, style: 'th' },
                { text: `Ref Output\n[${refUnit}]`, style: 'th' },
                { text: `Dw(Zmax)\n[${refUnit}]`, style: 'th' },
                { text: 'Var (%)', style: 'th' }
            ]
        ];

        document.querySelectorAll('#doseTable tbody tr').forEach(row => {
            const energy = row.querySelector('.inp-energy').value;
            const mode = row.querySelector('.inp-energy-mode').value;
            const engStr = energy ? `${energy} ${mode}` : '---';
            const mraw = row.querySelector('.mraw-avg-display').textContent;
            const kq = row.querySelector('.inp-kq').value || '---';
            const pdd = row.querySelector('.inp-pdd').value || '---';
            const ref = row.querySelector('.inp-ref').value || '---';
            const dzmax = row.querySelector('.out-dzmax').textContent;
            const varObj = row.querySelector('.out-var');
            const variation = varObj.textContent;
            
            // Apply color to variation cell
            const varColor = (varObj.style.color === 'rgb(217, 83, 79)') ? '#d9534f' : 
                             (varObj.style.color === 'rgb(92, 184, 92)') ? '#5cb85c' : '#333';

            resultsTableBody.push([
                engStr, mraw, kq, pdd, ref, 
                {text: dzmax, bold: true}, 
                {text: variation, bold: true, color: varColor}
            ]);
        });

        // 3. Construct Document Definition
        const docDefinition = {
            pageSize: 'A4',
            pageOrientation: 'landscape',
            pageMargins: [40, 40, 40, 40],
            styles: {
                title: { fontSize: 16, bold: true, color: '#0056b3', alignment: 'center', margin: [0, 0, 0, 5] },
                subtitle: { fontSize: 12, alignment: 'center', margin: [0, 0, 0, 20] },
                sectionHeader: { fontSize: 13, bold: true, color: '#0056b3', margin: [0, 15, 0, 8] },
                th: { bold: true, fillColor: '#eef2f5', color: '#0056b3', alignment: 'center', margin: [0,4,0,4] },
                cell: { margin: [0,4,0,4], alignment: 'center' },
                label: { bold: true, color: '#555' }
            },
            content: [
                // Header Row (Logo + Title)
                {
                    columns: [
                        logoBase64 ? { image: logoBase64, width: 80 } : { text: '', width: 80 },
                        {
                            width: '*',
                            text: [
                                { text: `REPORT ON OUTPUT MEASUREMENT OF ${therapyUnit.toUpperCase() || 'THERAPY UNIT'}\n`, style: 'title' },
                                { text: `Date: ${document.getElementById('date').value || '---'}`, style: 'subtitle' }
                            ]
                        },
                        { width: 80, text: '' } // Spacer to keep title centered
                    ],
                    margin: [0, 0, 0, 20]
                },
                
                // Section 1 & 2: Info Tables
                {
                    columns: [
                        {
                            width: '48%',
                            table: {
                                widths: ['50%', '50%'],
                                body: [
                                    [{text: '1. Reference Conditions', colSpan: 2, style: 'th'}, {}],
                                    [{text: 'Phantom', style: 'label'}, phant],
                                    [{text: 'Setup', style: 'label'}, setup],
                                    [{text: 'Zref [g/cm²]', style: 'label'}, zref],
                                    [{text: 'Field Size [cm x cm]', style: 'label'}, fSize],
                                    [{text: 'No. of MU', style: 'label'}, mu]
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
                                    [{text: 'Chamber Model (SN)', style: 'label'}, `${getText('chamberModel')} (${getText('chamberSerial')})`],
                                    [{text: 'N_D,w [cGy/nC]', style: 'label'}, getText('ndw')],
                                    [{text: 'Calibration Lab', style: 'label'}, getText('calLab')],
                                    [{text: 'Electrometer (SN)', style: 'label'}, `${getText('elecModel')} (${getText('elecSerial')})`]
                                ]
                            }
                        }
                    ]
                },

                { text: '3. Applied Correction Factors', style: 'sectionHeader' },
                {
                    table: {
                        widths: ['*','*','*','*'],
                        body: [
                            [
                                {text: 'k_TP (Temp/Pressure)', style: 'label'}, {text: kTP}, 
                                {text: 'k_pol (Polarity)', style: 'label'}, {text: kPol}
                            ],
                            [
                                {text: 'k_s (Recombination)', style: 'label'}, {text: kS}, 
                                {text: 'k_elec (Electrometer)', style: 'label'}, {text: kElec}
                            ]
                        ]
                    },
                    margin: [0, 0, 0, 15]
                },

                { text: '4. Absorbed Dose to Water Results', style: 'sectionHeader' },
                {
                    table: {
                        headerRows: 1,
                        widths: ['*', 'auto', '*', '*', '*', '*', '*'],
                        body: resultsTableBody
                    },
                    layout: 'lightHorizontalLines'
                },

                // Signatures
                {
                    columns: [
                        {
                            text: `Performed by:\n\n\n___________________________\n${getText('userName')}`,
                            alignment: 'left',
                            margin: [0, 60, 0, 0]
                        },
                        {
                            text: `Incharge Medical Physicist/RSO:\n\n\n___________________________\n`,
                            alignment: 'right',
                            margin: [0, 60, 0, 0]
                        }
                    ]
                }
            ]
        };

        // Create and Download PDF
        let filename = `${therapyUnit.replace(/[^a-z0-9]/gi, '_') || 'Unit'}_${document.getElementById('date').value || 'Date'}.pdf`;
        pdfMake.createPdf(docDefinition).download(filename);
    });
});
