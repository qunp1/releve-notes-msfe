document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const errorMessage = document.getElementById('errorMessage');
    const resultsContainer = document.getElementById('resultsContainer');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const suggestionsContainer = document.getElementById('suggestionsContainer');
    const printButton = document.getElementById('printButton');

    // UI Elements
    const studentNameEl = document.getElementById('studentName');
    const studentApogeeEl = document.getElementById('studentApogee');
    const profileAvatarEl = document.getElementById('profileAvatar');
    const globalAverageEl = document.getElementById('globalAverage');

    // Process and Normalize Data
    const students = new Map();
    const classAverages = { s1: {}, s2: {}, s3: {} };
    let currentStudent = null;
    let radarChartInstance = null;
    let activeSemesterChart = 's1';

    // Safe string parsing helpers
    const safeString = (val) => {
        if (val === null || val === undefined) return "";
        return val.toString();
    };

    const safeTrim = (val) => {
        return safeString(val).trim();
    };

    const safeReplace = (val, search, replaceWith) => {
        return safeString(val).replace(search, replaceWith);
    };

    const cleanTextEncoding = (str) => {
        if (str === null || str === undefined) return "";
        let cleaned = str.toString();
        // Replace unicode replacement char
        cleaned = cleaned.replace(/\uFFFD/g, 'e');
        
        // Clean typical French typography encoding issues
        cleaned = cleaned.replace(/Systémes/g, 'Systèmes');
        cleaned = cleaned.replace(/Etrangéres/g, 'Étrangères');
        cleaned = cleaned.replace(/Financiére/g, 'Financière');
        cleaned = cleaned.replace(/donnes/g, 'données');
        cleaned = cleaned.replace(/Fiscalite/g, 'Fiscalité');
        return cleaned;
    };

    // Helper to calculate dynamic grade color (Red to Green)
    const calculateGradeColor = (gradeStr) => {
        const grade = parseFloat(gradeStr);
        if (isNaN(grade)) return '#475569'; // Default slate gray for 'AB', 'EXC', etc.

        let hue, saturation = 80, lightness;

        if (grade < 10) {
            // Below average: Red (hue 0) to Orange (hue 30)
            hue = (grade / 10) * 30;
            // Darker red for lower grades, slightly lighter for grades near 10
            lightness = 40 + (grade / 10) * 10;
        } else {
            // Above average: Yellow-Green (hue 70) to Pure Green (hue 140)
            hue = 70 + ((grade - 10) / 10) * 70;
            // Darker green for higher grades
            lightness = 45 - ((grade - 10) / 10) * 15;
        }

        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };

    // Helper to render subjects
    const renderSubjects = (containerId, subjectsObj, average) => {
        const container = document.getElementById(containerId);
        const avgEl = document.getElementById(containerId.replace('Subjects', 'Average'));

        container.innerHTML = '';

        if (!subjectsObj || Object.keys(subjectsObj).length === 0) {
            container.innerHTML = '<div class="subject-item"><span class="subject-name" style="color: #94a3b8; font-style: italic;">Aucun résultat trouvé pour ce semestre.</span></div>';
            avgEl.textContent = '--';
            avgEl.style.color = 'inherit';
            return;
        }

        // Set Average
        avgEl.textContent = average || '--';
        if (average && !isNaN(parseFloat(average))) {
            avgEl.style.color = calculateGradeColor(average);
        } else {
            avgEl.style.color = 'inherit';
        }

        // Render Subjects
        for (const [name, grade] of Object.entries(subjectsObj)) {
            const item = document.createElement('div');
            item.className = 'subject-item';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'subject-name';
            nameSpan.textContent = cleanTextEncoding(name);

            const gradeSpan = document.createElement('span');
            gradeSpan.className = 'subject-grade';
            gradeSpan.textContent = grade;
            gradeSpan.style.color = calculateGradeColor(grade);

            // Add a print-only text version of the color logic if needed, but we will handle print color via CSS overrides
            gradeSpan.setAttribute('data-print-grade', grade);

            item.appendChild(nameSpan);
            item.appendChild(gradeSpan);
            container.appendChild(item);
        }
    };

    // Function to parse S1
    const parseS1 = () => {
        if (typeof dataS1 !== 'undefined' && dataS1.length > 2) {
            const headers = dataS1[0];
            const moyRow = dataS1[2];

            // Parse MOYENNE for S1
            if (moyRow && (moyRow.H1 === "MOYENNE" || moyRow.NUMERO === "MOYENNE")) {
                for (const key of Object.keys(moyRow)) {
                    if (key !== 'H1' && key !== 'H2' && key !== 'H3' && headers[key]) {
                        const grade = parseFloat(safeReplace(moyRow[key], ',', '.'));
                        if (!isNaN(grade)) classAverages.s1[headers[key]] = grade;
                    }
                }
            }

            // Skip index 0 (headers), 1 (MAX), 2 (MOYENNE)
            for (let i = 3; i < dataS1.length; i++) {
                const row = dataS1[i];
                const apogee = safeTrim(row.H1);
                if (!apogee) continue;

                const firstName = safeTrim(row.H2);
                const lastName = safeTrim(row.H3);

                // Extract subjects
                const subjects = {};
                let sum = 0;
                let count = 0;

                for (const key of Object.keys(row)) {
                    if (key !== 'H1' && key !== 'H2' && key !== 'H3' && headers[key]) {
                        let grade = safeTrim(row[key]);
                        const numGrade = parseFloat(grade.replace(',', '.'));
                        if (!isNaN(numGrade)) {
                            grade = numGrade.toFixed(2);
                            sum += numGrade;
                            count++;
                        }
                        subjects[headers[key]] = grade;
                    }
                }

                const moyenne = count > 0 ? (sum / count).toFixed(2) : "";

                if (!students.has(apogee)) {
                    students.set(apogee, { apogee, firstName, lastName, s1: {}, s2: {}, s3: {} });
                }

                const student = students.get(apogee);
                // Only update name if empty
                if (!student.firstName) student.firstName = firstName;
                if (!student.lastName) student.lastName = lastName;

                student.s1 = { subjects, moyenne };
            }
        }
    };

    // Function to parse S2 and S3
    const parseStandard = (dataArray, semesterKey) => {
        if (!dataArray || dataArray.length === 0) return;

        // Parse MOYENNE
        const moyRow = dataArray.find(row => safeTrim(row["CODE APOGEE"]) === "MOYENNE" || safeTrim(row["NUMERO"]) === "MOYENNE");
        if (moyRow) {
            for (const [key, value] of Object.entries(moyRow)) {
                if (key !== "CODE APOGEE" && key !== "First Name " && key !== "Last Name " && key !== "Moyennes" && key !== "NUMERO") {
                    if (key && key.trim() !== "") {
                        const grade = parseFloat(safeReplace(value, ',', '.'));
                        if (!isNaN(grade)) classAverages[semesterKey][key] = grade;
                    }
                }
            }
        }

        for (let i = 0; i < dataArray.length; i++) {
            const row = dataArray[i];
            const apogee = safeTrim(row["CODE APOGEE"] || row["NUMERO"]);

            // Skip metadata rows and empty rows
            if (!apogee || apogee === "MAX" || apogee === "MOYENNE") continue;

            const firstName = safeTrim(row["First Name "]);
            const lastName = safeTrim(row["Last Name "]);
            let moyenne = safeTrim(row["Moyennes"]);
            const numMoy = parseFloat(moyenne.replace(',', '.'));
            if (!isNaN(numMoy)) {
                moyenne = numMoy.toFixed(2);
            }

            const subjects = {};
            for (const [key, value] of Object.entries(row)) {
                if (key !== "CODE APOGEE" && key !== "First Name " && key !== "Last Name " && key !== "Moyennes" && key !== "NUMERO") {
                    if (key && key.trim() !== "") {
                        let grade = safeTrim(value);
                        const numGrade = parseFloat(grade.replace(',', '.'));
                        if (!isNaN(numGrade)) {
                            grade = numGrade.toFixed(2);
                        }
                        subjects[key] = grade;
                    }
                }
            }

            if (!students.has(apogee)) {
                students.set(apogee, { apogee, firstName, lastName, s1: {}, s2: {}, s3: {} });
            }

            const student = students.get(apogee);
            if (!student.firstName) student.firstName = firstName;
            if (!student.lastName) student.lastName = lastName;

            student[semesterKey] = { subjects, moyenne };
        }
    };

    // Initialize Data Parsing
    try {
        if (typeof dataS1 !== 'undefined') parseS1();
        if (typeof dataS2 !== 'undefined') parseStandard(dataS2, 's2');
        if (typeof dataS3 !== 'undefined') parseStandard(dataS3, 's3');
    } catch (e) {
        console.error("Error parsing data", e);
    }

    // Convert Map to Array for searching
    const studentsList = Array.from(students.values());

    // Populate the compare select dropdown
    const compareSelect = document.getElementById('compareSelect');
    if (compareSelect) {
        const sorted = [...studentsList].sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
        sorted.forEach(s => {
            if (s.lastName && s.firstName) {
                const opt = document.createElement('option');
                opt.value = s.apogee;
                opt.textContent = `${s.lastName} ${s.firstName}`;
                compareSelect.appendChild(opt);
            }
        });
    }

    // Helper for string normalization (removes accents, spaces, lowercase)
    const normalizeString = (str) => {
        if (!str) return "";
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "");
    };

    // Levenshtein distance for fuzzy matching
    const levenshtein = (a, b) => {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
        for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        Math.min(matrix[i][j - 1] + 1, // insertion
                            matrix[i - 1][j] + 1)); // deletion
                }
            }
        }
        return matrix[b.length][a.length];
    };

    // Fuzzy match logic
    const isFuzzyMatch = (student, query) => {
        const normQuery = normalizeString(query);
        if (!normQuery) return false;

        // Exact Apogee match
        if (student.apogee === query.trim()) return true;

        const first = normalizeString(student.firstName);
        const last = normalizeString(student.lastName);
        const full1 = first + last;
        const full2 = last + first;

        // Substring match
        if (full1.includes(normQuery) || full2.includes(normQuery)) return true;

        // Fuzzy match on individual names if query is at least 3 chars
        if (normQuery.length >= 3) {
            // Allow 1 typo for words of length 3-4, 2 typos for 5+
            const tolerance = normQuery.length >= 5 ? 2 : 1;
            if (levenshtein(last, normQuery) <= tolerance) return true;
            if (levenshtein(first, normQuery) <= tolerance) return true;
        }

        return false;
    };

    // Highlight match query inside autocomplete item
    const highlightMatch = (text, query) => {
        if (!query) return text;
        const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        return text.replace(regex, '<span class="highlight">$1</span>');
    };

    let activeSuggestionIndex = -1;
    let filteredSuggestions = [];

    // Show custom suggestions dropdown
    const showSuggestions = (query) => {
        suggestionsContainer.innerHTML = '';
        activeSuggestionIndex = -1;

        if (query.length < 2) {
            suggestionsContainer.classList.add('hidden');
            clearSearchBtn.classList.add('hidden');
            return;
        }

        clearSearchBtn.classList.remove('hidden');

        // Filter matches
        const isNumberQuery = /^\d/.test(query);
        if (isNumberQuery) {
            filteredSuggestions = studentsList.filter(s => s.apogee.startsWith(query));
        } else {
            filteredSuggestions = studentsList.filter(s => isFuzzyMatch(s, query));
        }

        // Limit results to 8
        filteredSuggestions = filteredSuggestions.slice(0, 8);

        if (filteredSuggestions.length === 0) {
            const noResult = document.createElement('div');
            noResult.className = 'suggestion-item';
            noResult.style.color = 'var(--text-muted)';
            noResult.style.fontStyle = 'italic';
            noResult.style.cursor = 'default';
            noResult.textContent = 'Aucun étudiant trouvé';
            suggestionsContainer.appendChild(noResult);
            suggestionsContainer.classList.remove('hidden');
            return;
        }

        filteredSuggestions.forEach((student, index) => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.setAttribute('data-index', index);

            const nameText = `${student.lastName} ${student.firstName}`;
            const nameSpan = document.createElement('span');
            nameSpan.innerHTML = highlightMatch(nameText, query);

            const apogeeSpan = document.createElement('span');
            apogeeSpan.className = 'apogee-code';
            apogeeSpan.innerHTML = highlightMatch(student.apogee, query);

            item.appendChild(nameSpan);
            item.appendChild(apogeeSpan);

            // Click listener
            item.addEventListener('click', () => {
                selectSuggestion(student);
            });

            suggestionsContainer.appendChild(item);
        });

        suggestionsContainer.classList.remove('hidden');
    };

    const selectSuggestion = (student) => {
        searchInput.value = `${student.lastName} ${student.firstName}`;
        suggestionsContainer.classList.add('hidden');
        displayStudent(student);
        searchInput.blur();
    };

    const updateActiveSuggestion = () => {
        const items = suggestionsContainer.querySelectorAll('.suggestion-item');
        items.forEach((item, index) => {
            if (index === activeSuggestionIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    };

    // Dynamic Suggestions
    searchInput.addEventListener('input', (e) => {
        showSuggestions(e.target.value.trim());
    });

    searchInput.addEventListener('focus', (e) => {
        if (e.target.value.trim().length >= 2) {
            showSuggestions(e.target.value.trim());
        }
    });

    // Keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
        const items = suggestionsContainer.querySelectorAll('.suggestion-item');
        const hasVisibleSuggestions = !suggestionsContainer.classList.contains('hidden') && items.length > 0;
        if (!hasVisibleSuggestions) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex + 1) % filteredSuggestions.length;
            updateActiveSuggestion();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex - 1 + filteredSuggestions.length) % filteredSuggestions.length;
            updateActiveSuggestion();
        } else if (e.key === 'Enter') {
            if (activeSuggestionIndex >= 0 && activeSuggestionIndex < filteredSuggestions.length) {
                e.preventDefault();
                selectSuggestion(filteredSuggestions[activeSuggestionIndex]);
            }
        } else if (e.key === 'Escape') {
            suggestionsContainer.classList.add('hidden');
            searchInput.blur();
        }
    });

    // Clear Search Input Button
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        suggestionsContainer.classList.add('hidden');
        clearSearchBtn.classList.add('hidden');
        resultsContainer.classList.add('hidden');
        errorMessage.style.opacity = '0';
        currentStudent = null;
        if (radarChartInstance) {
            radarChartInstance.destroy();
            radarChartInstance = null;
        }
        searchInput.focus();
    });

    // Dismiss suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-input-wrapper')) {
            suggestionsContainer.classList.add('hidden');
        }
    });

    // Helper to calculate Global Average (Exclusion logic removed)
    const getGlobalAverage = (student) => {
        let totalAvg = 0;
        let avgCount = 0;
        if (student.s1?.moyenne && !isNaN(parseFloat(student.s1.moyenne))) { totalAvg += parseFloat(student.s1.moyenne); avgCount++; }
        if (student.s2?.moyenne && !isNaN(parseFloat(student.s2.moyenne))) { totalAvg += parseFloat(student.s2.moyenne); avgCount++; }
        if (student.s3?.moyenne && !isNaN(parseFloat(student.s3.moyenne))) { totalAvg += parseFloat(student.s3.moyenne); avgCount++; }

        if (avgCount > 0) {
            return parseFloat((totalAvg / avgCount).toFixed(2));
        }
        return 0;
    };

    // Helper to Display a Student
    const displayStudent = (student) => {
        currentStudent = student;
        errorMessage.style.opacity = '0';

        const leaderboardContainer = document.getElementById('leaderboardContainer');
        if (leaderboardContainer) leaderboardContainer.classList.add('hidden');

        // Display results
        const displayName = `${student.lastName} ${student.firstName}`;
        studentNameEl.textContent = displayName;
        studentApogeeEl.textContent = student.apogee;
        const firstInit = student.firstName ? student.firstName.trim().charAt(0).toUpperCase() : '';
        const lastInit = student.lastName ? student.lastName.trim().charAt(0).toUpperCase() : '';
        profileAvatarEl.textContent = `${firstInit}${lastInit}` || 'E';

        // Update document title for PDF saving
        document.title = `Relevé de Notes - ${displayName.toUpperCase()}`;

        // Update Report Button Mailto Link
        const reportButton = document.getElementById('reportButton');
        if (reportButton) {
            const emailAddress = "Anas.Bouayadi@ump.ac.ma";
            const emailSubject = encodeURIComponent(`Erreur de notes - ${displayName}`);
            const emailBody = encodeURIComponent(`Bonjour,\n\nJ'ai constaté une erreur dans mon relevé de notes.\n\nNom: ${displayName}\nCode Apogée: ${student.apogee}\n\nMerci de corriger l'erreur suivante :\n\n`);
            reportButton.href = `mailto:${emailAddress}?subject=${emailSubject}&body=${emailBody}`;
        }

        // Render Semesters
        renderSubjects('s1Subjects', student.s1?.subjects || {}, student.s1?.moyenne);
        renderSubjects('s2Subjects', student.s2?.subjects || {}, student.s2?.moyenne);
        renderSubjects('s3Subjects', student.s3?.subjects || {}, student.s3?.moyenne);

        // Calculate Global Average
        const globalAvgNum = getGlobalAverage(student);
        globalAverageEl.style.fontSize = ''; // Reset font size in case it was changed

        if (globalAvgNum > 0) {
            const globalStr = globalAvgNum.toFixed(2);
            globalAverageEl.textContent = globalStr;
            globalAverageEl.style.color = calculateGradeColor(globalStr);
        } else {
            globalAverageEl.textContent = '--';
            globalAverageEl.style.color = 'inherit';
        }

        // Show container
        resultsContainer.classList.remove('hidden');

        // Update Chart
        updateChart();

        // Retrigger animations
        const cards = document.querySelectorAll('.fade-in');
        cards.forEach(card => {
            card.style.animation = 'none';
            card.offsetHeight; // trigger reflow
            card.style.animation = null;
        });
    };

    // Render Leaderboard
    const renderLeaderboard = () => {
        const leaderboardContainer = document.getElementById('leaderboardContainer');
        const leaderboardList = document.getElementById('leaderboardList');

        resultsContainer.classList.add('hidden');
        errorMessage.style.opacity = '0';
        leaderboardContainer.classList.remove('hidden');

        // Calculate averages and sort
        const rankedStudents = studentsList.map(s => {
            return {
                ...s,
                globalAvgNum: getGlobalAverage(s)
            };
        }).filter(s => s.globalAvgNum > 0)
            .sort((a, b) => b.globalAvgNum - a.globalAvgNum);

        leaderboardList.innerHTML = '';

        rankedStudents.forEach((student, index) => {
            const rank = index + 1;
            const item = document.createElement('div');
            item.className = `leaderboard-item fade-in rank-${rank <= 3 ? rank : 'other'}`;
            item.style.setProperty('--animation-order', (index * 0.05).toString());

            const rankEl = document.createElement('div');
            rankEl.className = 'leaderboard-rank';
            rankEl.textContent = rank;

            const avatarEl = document.createElement('div');
            avatarEl.className = 'leaderboard-avatar';
            const firstInit = student.firstName ? student.firstName.trim().charAt(0).toUpperCase() : '';
            const lastInit = student.lastName ? student.lastName.trim().charAt(0).toUpperCase() : '';
            avatarEl.textContent = `${firstInit}${lastInit}` || 'E';

            const nameEl = document.createElement('div');
            nameEl.className = 'leaderboard-name';
            nameEl.textContent = `${student.lastName} ${student.firstName}`;

            const avgEl = document.createElement('div');
            avgEl.className = 'leaderboard-avg';
            avgEl.textContent = student.globalAvgNum.toFixed(2);
            avgEl.style.color = calculateGradeColor(student.globalAvgNum.toString());

            item.appendChild(rankEl);
            item.appendChild(avatarEl);
            item.appendChild(nameEl);
            item.appendChild(avgEl);

            item.addEventListener('click', () => {
                displayStudent(student);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });

            leaderboardList.appendChild(item);
        });
    };

    // Search Logic
    const handleSearch = () => {
        const query = searchInput.value.trim();

        if (!query) {
            errorMessage.textContent = 'Veuillez entrer un Nom ou un Code Apogée.';
            errorMessage.style.opacity = '1';
            resultsContainer.classList.add('hidden');
            return;
        }

        const student = studentsList.find(s => isFuzzyMatch(s, query));

        if (!student) {
            errorMessage.textContent = 'Étudiant introuvable. Veuillez vérifier le nom ou le code.';
            errorMessage.style.opacity = '1';
            resultsContainer.classList.add('hidden');
            return;
        }

        displayStudent(student);
    };

    // Chart Update Logic
    const updateChart = () => {
        if (!currentStudent) return;

        const chartSection = document.getElementById('chartSection');
        chartSection.style.display = 'block'; // Show chart

        let studentSubjects = {};
        let compareSubjects = {};
        let compareLabel = 'Moyenne Classe';
        const compareValue = document.getElementById('compareSelect')?.value || 'average';

        if (activeSemesterChart === 's1') {
            studentSubjects = currentStudent.s1?.subjects || {};
        } else if (activeSemesterChart === 's2') {
            studentSubjects = currentStudent.s2?.subjects || {};
        } else if (activeSemesterChart === 's3') {
            studentSubjects = currentStudent.s3?.subjects || {};
        }

        if (compareValue === 'average') {
            if (activeSemesterChart === 's1') compareSubjects = classAverages.s1 || {};
            else if (activeSemesterChart === 's2') compareSubjects = classAverages.s2 || {};
            else if (activeSemesterChart === 's3') compareSubjects = classAverages.s3 || {};
        } else {
            const compareStudent = studentsList.find(s => s.apogee === compareValue);
            if (compareStudent) {
                compareLabel = `${compareStudent.lastName} ${compareStudent.firstName}`;
                if (activeSemesterChart === 's1') compareSubjects = compareStudent.s1?.subjects || {};
                else if (activeSemesterChart === 's2') compareSubjects = compareStudent.s2?.subjects || {};
                else if (activeSemesterChart === 's3') compareSubjects = compareStudent.s3?.subjects || {};
            }
        }

        const labels = Object.keys(studentSubjects).map(l => cleanTextEncoding(l).substring(0, 20) + (l.length > 20 ? '...' : ''));
        const studentData = Object.values(studentSubjects).map(val => parseFloat(val) || 0);
        const avgData = Object.keys(studentSubjects).map(key => parseFloat(compareSubjects[key]) || null);

        // If no subjects, hide the chart
        if (labels.length === 0) {
            if (radarChartInstance) radarChartInstance.destroy();
            return;
        }

        const ctx = document.getElementById('radarChart').getContext('2d');

        if (radarChartInstance) {
            radarChartInstance.destroy();
        }

        radarChartInstance = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Vos Notes',
                        data: studentData,
                        backgroundColor: 'rgba(37, 99, 235, 0.2)', // Primary blue
                        borderColor: 'rgba(37, 99, 235, 1)',
                        pointBackgroundColor: 'rgba(37, 99, 235, 1)',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: 'rgba(37, 99, 235, 1)',
                        borderWidth: 2,
                    },
                    {
                        label: compareLabel,
                        data: avgData,
                        backgroundColor: 'rgba(239, 68, 68, 0.1)', // Muted red
                        borderColor: 'rgba(239, 68, 68, 0.8)',
                        pointBackgroundColor: 'rgba(239, 68, 68, 1)',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: 'rgba(239, 68, 68, 1)',
                        borderWidth: 2,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0,
                        max: 20,
                        angleLines: { color: 'rgba(0,0,0,0.1)' },
                        grid: { color: 'rgba(0,0,0,0.1)' },
                        pointLabels: {
                            font: { family: "'Inter', sans-serif", size: window.innerWidth < 768 ? 9 : 11 },
                            color: '#475569',
                            callback: function (label) {
                                if (window.innerWidth < 768 && label.length > 10) {
                                    return label.substring(0, 10) + '...';
                                }
                                return label;
                            }
                        },
                        ticks: {
                            stepSize: 4,
                            backdropColor: 'transparent',
                            color: '#94a3b8'
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { font: { family: "'Outfit', sans-serif" }, usePointStyle: true }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { family: "'Outfit', sans-serif" },
                        bodyFont: { family: "'Inter', sans-serif" },
                        padding: 10,
                        cornerRadius: 8
                    }
                }
            }
        });
    };

    // Toggle Buttons Logic
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            activeSemesterChart = e.target.getAttribute('data-semester');
            updateChart();
        });
    });

    const compareSelectEl = document.getElementById('compareSelect');
    if (compareSelectEl) compareSelectEl.addEventListener('change', updateChart);

    document.getElementById('leaderboardBtn').addEventListener('click', renderLeaderboard);
    document.getElementById('closeLeaderboardBtn').addEventListener('click', () => {
        document.getElementById('leaderboardContainer').classList.add('hidden');
    });

    searchButton.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    printButton.addEventListener('click', () => {
        window.print();
    });
});
