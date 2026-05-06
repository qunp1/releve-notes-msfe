document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const errorMessage = document.getElementById('errorMessage');
    const resultsContainer = document.getElementById('resultsContainer');
    const studentsListEl = document.getElementById('studentsList');
    const printButton = document.getElementById('printButton');

    // UI Elements
    const studentNameEl = document.getElementById('studentName');
    const studentApogeeEl = document.getElementById('studentApogee');
    const profileAvatarEl = document.getElementById('profileAvatar');
    const globalAverageEl = document.getElementById('globalAverage');

    // Process and Normalize Data
    const students = new Map();

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
            nameSpan.textContent = name.replace(/\uFFFD/g, 'e');

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
        if (typeof dataS1 !== 'undefined' && dataS1.length > 0) {
            const headers = dataS1[0];
            // Skip index 0 (headers), 1 (MAX), 2 (MOYENNE)
            for (let i = 3; i < dataS1.length; i++) {
                const row = dataS1[i];
                const apogee = row.H1 ? row.H1.toString().trim() : "";
                if (!apogee) continue;

                const firstName = row.H2 ? row.H2.trim() : "";
                const lastName = row.H3 ? row.H3.trim() : "";

                // Extract subjects
                const subjects = {};
                let sum = 0;
                let count = 0;

                for (const key of Object.keys(row)) {
                    if (key !== 'H1' && key !== 'H2' && key !== 'H3' && headers[key]) {
                        const grade = row[key].trim();
                        subjects[headers[key]] = grade;
                        const numGrade = parseFloat(grade.replace(',', '.'));
                        if (!isNaN(numGrade)) {
                            sum += numGrade;
                            count++;
                        }
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

        for (let i = 0; i < dataArray.length; i++) {
            const row = dataArray[i];
            const apogee = row["CODE APOGEE"] ? row["CODE APOGEE"].toString().trim() : "";

            // Skip metadata rows and empty rows
            if (!apogee || apogee === "MAX" || apogee === "MOYENNE") continue;

            const firstName = row["First Name "] ? row["First Name "].trim() : "";
            const lastName = row["Last Name "] ? row["Last Name "].trim() : "";
            const moyenne = row["Moyennes"] ? row["Moyennes"].trim() : "";

            const subjects = {};
            for (const [key, value] of Object.entries(row)) {
                if (key !== "CODE APOGEE" && key !== "First Name " && key !== "Last Name " && key !== "Moyennes" && key !== "NUMERO") {
                    if (key && key.trim() !== "") {
                        subjects[key] = value ? value.toString().trim() : "";
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

    // Populate Datalist for Auto-suggestions
    studentsList.forEach(student => {
        if (student.lastName && student.firstName) {
            const option = document.createElement('option');
            option.value = `${student.lastName} ${student.firstName}`;
            studentsListEl.appendChild(option);

            const optionApogee = document.createElement('option');
            optionApogee.value = student.apogee;
            studentsListEl.appendChild(optionApogee);
        }
    });

    // Search Logic
    const handleSearch = () => {
        const query = searchInput.value.trim().toLowerCase();

        if (!query) {
            errorMessage.textContent = 'Veuillez entrer un Nom ou un Code Apogée.';
            errorMessage.style.opacity = '1';
            resultsContainer.classList.add('hidden');
            return;
        }

        errorMessage.style.opacity = '0';

        // Find student
        const student = studentsList.find(s => {
            const fullName1 = `${s.firstName} ${s.lastName}`.toLowerCase();
            const fullName2 = `${s.lastName} ${s.firstName}`.toLowerCase();
            return s.apogee === query || fullName1.includes(query) || fullName2.includes(query) || s.lastName.toLowerCase() === query || s.firstName.toLowerCase() === query;
        });

        if (!student) {
            errorMessage.textContent = 'Étudiant introuvable. Veuillez vérifier le nom ou le code.';
            errorMessage.style.opacity = '1';
            resultsContainer.classList.add('hidden');
            return;
        }

        // Display results
        const displayName = `${student.lastName} ${student.firstName}`;
        studentNameEl.textContent = displayName;
        studentApogeeEl.textContent = student.apogee;
        profileAvatarEl.textContent = student.lastName ? student.lastName.charAt(0).toUpperCase() : 'E';

        // Update document title for PDF saving
        document.title = `Relevé de Notes - ${displayName.toUpperCase()}`;

        // Update Report Button Mailto Link
        const reportButton = document.getElementById('reportButton');
        if (reportButton) {
            // Replace 'votre.email@example.com' with the actual email you want them to contact
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
        let totalAvg = 0;
        let avgCount = 0;
        if (student.s1?.moyenne && !isNaN(parseFloat(student.s1.moyenne))) { totalAvg += parseFloat(student.s1.moyenne); avgCount++; }
        if (student.s2?.moyenne && !isNaN(parseFloat(student.s2.moyenne))) { totalAvg += parseFloat(student.s2.moyenne); avgCount++; }
        if (student.s3?.moyenne && !isNaN(parseFloat(student.s3.moyenne))) { totalAvg += parseFloat(student.s3.moyenne); avgCount++; }

        const fullNameLower = `${student.firstName} ${student.lastName}`.toLowerCase();
        const isExcluded = (fullNameLower.includes('asmae') && fullNameLower.includes('karnaoui')) ||
            (fullNameLower.includes('nouhaila') && fullNameLower.includes('boulekhrif'));

        globalAverageEl.style.fontSize = ''; // Reset font size in case it was changed

        if (isExcluded) {
            globalAverageEl.textContent = 'EXCLU';
            globalAverageEl.style.color = '#ef4444'; // Red color
            globalAverageEl.style.fontSize = '1.8rem';
        } else if (avgCount > 0) {
            const global = (totalAvg / avgCount).toFixed(2);
            globalAverageEl.textContent = global;
            globalAverageEl.style.color = calculateGradeColor(global);
        } else {
            globalAverageEl.textContent = '--';
            globalAverageEl.style.color = 'inherit';
        }

        // Show container
        resultsContainer.classList.remove('hidden');

        // Retrigger animations
        const cards = document.querySelectorAll('.fade-in');
        cards.forEach(card => {
            card.style.animation = 'none';
            card.offsetHeight; // trigger reflow
            card.style.animation = null;
        });
    };

    searchButton.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    printButton.addEventListener('click', () => {
        window.print();
    });
});
