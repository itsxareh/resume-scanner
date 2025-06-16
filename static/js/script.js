class UniversalResumeScanner {
    constructor() {
        this.resumes = [];
        this.jobDescription = '';
        this.selectedIndustry = '';
        this.results = [];
        this.currentFilter = 'all';
        this.initializeEventListeners();
        this.industrySkills = {};
    }

    initializeEventListeners() {
        const uploadZone = document.getElementById('uploadZone');
        const fileInput = document.getElementById('fileInput');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const jobDescTextarea = document.getElementById('jobDescription');
        const industrySelector = document.getElementById('industrySelector');

        uploadZone.addEventListener('click', () => fileInput.click());
        uploadZone.addEventListener('dragover', this.handleDragOver.bind(this));
        uploadZone.addEventListener('drop', this.handleDrop.bind(this));
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));

        jobDescTextarea.addEventListener('input', this.validateInputs.bind(this));
        industrySelector.addEventListener('change', this.handleIndustryChange.bind(this));

        analyzeBtn.addEventListener('click', this.analyzeResumes.bind(this));
    }

    async handleIndustryChange() {
        const selector = document.getElementById('industrySelector');
        const preview = document.getElementById('industryPreview');
        
        if (selector.value) {
            try {
                const response = await fetch(`/api/industry-skills/${selector.value}`);
                const skills = await response.json();
                
                if (skills.technical) {
                    preview.innerHTML = `
                        <strong>Key Skills for ${selector.options[selector.selectedIndex].text}:</strong><br>
                        Technical: ${skills.technical.slice(0, 8).join(', ')}...<br>
                        Soft Skills: ${skills.soft.slice(0, 5).join(', ')}...
                    `;
                }
            } catch (error) {
                console.error('Error fetching industry skills:', error);
                preview.innerHTML = '';
            }
        } else {
            preview.innerHTML = '';
        }
        this.validateInputs();
    }

    handleDragOver(e) {
        e.preventDefault();
        document.getElementById('uploadZone').classList.add('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        document.getElementById('uploadZone').classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        this.processFiles(files);
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.processFiles(files);
    }

    processFiles(files) {
        const validFiles = files.filter(file => 
            file.type === 'application/pdf' || 
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.type === 'text/plain'
        );

        validFiles.forEach(file => {
            const resumeData = {
                name: file.name,
                file: file,
                email: 'Will be extracted',
                phone: 'Will be extracted'
            };
            this.resumes.push(resumeData);
        });

        this.updateFileList();
        this.validateInputs();
    }

    updateFileList() {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';

        this.resumes.forEach((resume, index) => {
            const item = document.createElement('div');
            item.className = 'file-item';

            const icon = document.createElement('span');
            icon.textContent = '📄';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'file-name';
            nameSpan.textContent = resume.name || resume.filename;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'file-remove';
            removeBtn.textContent = '×';

            removeBtn.addEventListener('click', () => {
                this.removeResume(index);
            });

            item.appendChild(icon);
            item.appendChild(nameSpan);
            item.appendChild(removeBtn);
            fileList.appendChild(item);
        });
    }

    removeResume(index) {
        this.resumes.splice(index, 1);
        this.updateFileList();
        this.validateInputs();
    }

    validateInputs() {
        const jobDesc = document.getElementById('jobDescription').value.trim();
        const analyzeBtn = document.getElementById('analyzeBtn');
        analyzeBtn.disabled = !(this.resumes.length > 0 && jobDesc.length > 10);
    }

    async analyzeResumes() {
        const jobDesc = document.getElementById('jobDescription').value.trim();
        const industry = document.getElementById('industrySelector').value;
        const deepAnalysis = document.getElementById('deepAnalysis').checked;
        const skillGaps = document.getElementById('skillGaps').checked;
        const salaryInsights = document.getElementById('salaryInsights').checked;
        const cultureFit = document.getElementById('cultureFit').checked;

        this.jobDescription = jobDesc;
        this.selectedIndustry = industry;

        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('resumeResults').innerHTML = '';

        const formData = new FormData();
        formData.append('jobDescription', jobDesc);
        formData.append('industry', industry);
        formData.append('deepAnalysis', deepAnalysis ? 'on' : 'off');
        formData.append('skillGaps', skillGaps ? 'on' : 'off');
        formData.append('salaryInsights', salaryInsights ? 'on' : 'off');
        formData.append('cultureFit', cultureFit ? 'on' : 'off');

        this.resumes.forEach(resume => {
            formData.append('resumes', resume.file);
        });

        try {
            const response = await fetch('/analyze', {
                method: 'POST',
                body: formData
            });

            const text = await response.text(); 
            let data;
            try {
                data = JSON.parse(text);
            } catch (err) {
                throw new Error("Invalid JSON response: " + text);
            }

            if (!response.ok) {
                throw new Error(data.error || 'Analysis failed');
            }

            this.results = data.results;
            this.renderFilters();
            this.renderStats(data.stats);
            this.displayResults(this.results);
        } catch (error) {
            console.error('Error analyzing resumes:', error);
            this.showError('Analysis failed: ' + error.message);
        } finally {
            document.getElementById('loadingIndicator').style.display = 'none';
        }
    }

    showError(message) {
        const resultsContainer = document.getElementById('resumeResults');
        resultsContainer.innerHTML = `
            <div class="error-message">
                <strong>Error:</strong> ${message}
            </div>
        `;
    }

    renderFilters() {
        const filtersContainer = document.getElementById('filtersContainer');
        filtersContainer.innerHTML = `
            <div class="filter-group">
                <label><strong>Filter by Score:</strong></label>
                <select id="scoreFilter">
                    <option value="all">All</option>
                    <option value="high">High (≥ 10)</option>
                    <option value="medium">Medium (5–9)</option>
                    <option value="low">Low (&lt; 5)</option>
                </select>
            </div>
            <div class="filter-group">
                <label><strong>Skill Match:</strong></label>
                <select id="skillMatchFilter">
                    <option value="all">All</option>
                    <option value="technical">Technical Skills</option>
                    <option value="soft">Soft Skills</option>
                    <option value="certifications">Certifications</option>
                    <option value="none">No Match</option>
                </select>
            </div>
        `;

        document.getElementById('scoreFilter').addEventListener('change', this.applyFilters.bind(this));
        document.getElementById('skillMatchFilter').addEventListener('change', this.applyFilters.bind(this));
    }

    applyFilters() {
        const scoreFilter = document.getElementById('scoreFilter').value;
        const skillFilter = document.getElementById('skillMatchFilter').value;

        let filtered = this.results;

        if (scoreFilter === 'high') {
            filtered = filtered.filter(r => r.score >= 10);
        } else if (scoreFilter === 'medium') {
            filtered = filtered.filter(r => r.score >= 5 && r.score < 10);
        } else if (scoreFilter === 'low') {
            filtered = filtered.filter(r => r.score < 5);
        }

        if (skillFilter === 'technical') {
            filtered = filtered.filter(r => r.foundSkills.technical.length > 0);
        } else if (skillFilter === 'soft') {
            filtered = filtered.filter(r => r.foundSkills.soft.length > 0);
        } else if (skillFilter === 'certifications') {
            filtered = filtered.filter(r => r.foundSkills.certifications.length > 0);
        } else if (skillFilter === 'none') {
            filtered = filtered.filter(r => 
                r.foundSkills.technical.length === 0 &&
                r.foundSkills.soft.length === 0 &&
                r.foundSkills.certifications.length === 0
            );
        }

        this.displayResults(filtered);
    }
    
    renderStats(stats) {
        const statsContainer = document.getElementById('statsContainer');
        statsContainer.innerHTML = `
            <div class="stats-box">
                <strong>Total Resumes:</strong> ${stats.total}
            </div>
            <div class="stats-box">
                <strong>Average Score:</strong> ${stats.avgScore}
            </div>
            <div class="stats-box">
                <strong>With Technical Skills:</strong> ${stats.withTechnicalSkills}
            </div>
            <div class="stats-box">
                <strong>With Soft Skills:</strong> ${stats.withSoftSkills}
            </div>
            <div class="stats-box">
                <strong>With Certifications:</strong> ${stats.withCertifications}
            </div>
        `;
    }

    displayResults(results) {
        const container = document.getElementById("resumeResults");
        container.innerHTML = ""; 

        if (results.length === 0) {
            container.innerHTML = "<p>No resumes match the current filters.</p>";
            return;
        }

        results.sort((a, b) => b.score - a.score);
        
        results.forEach(result => {
            const div = document.createElement('div');
            div.className = 'result-card';
            div.innerHTML = `
                <p><strong>Analysis Summary:</strong> ${result.summary}</p>
                <h3>${result.name}</h3>
                <p><strong>Email:</strong> ${result.email}</p>
                <p><strong>Phone:</strong> ${result.phone}</p>
                <p><strong>Score:</strong> ${result.score}</p>
                <p><strong>Skills Matched:</strong><br>
                    Technical: ${result.foundSkills.technical.join(', ') || 'None'}<br>
                    Soft: ${result.foundSkills.soft.join(', ') || 'None'}<br>
                    Certifications: ${result.foundSkills.certifications.join(', ') || 'None'}
                </p>
                ${result.gapAnalysis ? `
                    <details>
                        <summary><strong>Skill Gaps</strong></summary>
                        Technical: ${result.gapAnalysis.technical.join(', ') || 'None'}<br>
                        Soft: ${result.gapAnalysis.soft.join(', ') || 'None'}<br>
                        Certifications: ${result.gapAnalysis.certifications.join(', ') || 'None'}
                    </details>
                ` : ''}
                ${result.salaryEstimate ? `<p><strong>Estimated Salary:</strong> ${result.salaryEstimate}</p>` : ''}
                ${result.cultureMatch ? `<p><strong>Culture Fit:</strong> ${result.cultureMatch}</p>` : ''}
            `;
            container.appendChild(div);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => new UniversalResumeScanner());
