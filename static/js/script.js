class ResumeScanner {
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
        
        if (selector.value !== "") {
            try {
                const response = await fetch(`/api/industry-skills/${selector.value}`);
                const skills = await response.json();
                
                if (skills.technical) {
                    preview.style.display = 'block';
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
            preview.style.display = 'none';
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
                <label><strong>Filter by Overall Score:</strong></label>
                <select id="scoreFilter">
                    <option value="all">All Scores</option>
                    <option value="high">High Score (≥ 15)</option>
                    <option value="medium">Medium Score (8–14)</option>
                    <option value="low">Low Score (&lt; 8)</option>
                </select>
            </div>
            <div class="filter-group">
                <label><strong>Filter by JD Relevance:</strong></label>
                <select id="relevanceFilter">
                    <option value="all">All Relevance</option>
                    <option value="high">High Relevance (≥ 70%)</option>
                    <option value="medium">Medium Relevance (40–69%)</option>
                    <option value="low">Low Relevance (&lt; 40%)</option>
                </select>
            </div>
            <div class="filter-group">
                <label><strong>Experience Level:</strong></label>
                <select id="experienceFilter">
                    <option value="all">All Experience</option>
                    <option value="1">Entry Level (1 year)</option>
                    <option value="2">Junior (2 years)</option>
                    <option value="3">Mid Level (3 years)</option>
                    <option value="4">Senior (4 years)</option>
                    <option value="5">Lead/Principal (5+ years)</option>
                </select>
            </div>
            <div class="filter-group">
                <label><strong>Skill Match:</strong></label>
                <select id="skillMatchFilter">
                    <option value="all">All</option>
                    <option value="technical">Technical Skills</option>
                    <option value="soft">Soft Skills</option>
                    <option value="certifications">Certifications</option>
                    <option value="jd_specific">JD-Specific Skills</option>
                    <option value="none">No Match</option>
                </select>
            </div>
        `;

        document.getElementById('scoreFilter').addEventListener('change', this.applyFilters.bind(this));
        document.getElementById('relevanceFilter').addEventListener('change', this.applyFilters.bind(this));
        document.getElementById('experienceFilter').addEventListener('change', this.applyFilters.bind(this));
        document.getElementById('skillMatchFilter').addEventListener('change', this.applyFilters.bind(this));
    }

    applyFilters() {
        const scoreFilter = document.getElementById('scoreFilter').value;
        const relevanceFilter = document.getElementById('relevanceFilter').value;
        const experienceFilter = document.getElementById('experienceFilter').value;
        const skillFilter = document.getElementById('skillMatchFilter').value;

        let filtered = this.results;

        // Score filter
        if (scoreFilter === 'high') {
            filtered = filtered.filter(r => r.score >= 15);
        } else if (scoreFilter === 'medium') {
            filtered = filtered.filter(r => r.score >= 8 && r.score < 15);
        } else if (scoreFilter === 'low') {
            filtered = filtered.filter(r => r.score < 8);
        }

        // Relevance filter
        if (relevanceFilter === 'high') {
            filtered = filtered.filter(r => r.relevanceScore >= 70);
        } else if (relevanceFilter === 'medium') {
            filtered = filtered.filter(r => r.relevanceScore >= 40 && r.relevanceScore < 70);
        } else if (relevanceFilter === 'low') {
            filtered = filtered.filter(r => r.relevanceScore < 40);
        }

        // Experience filter
        if (experienceFilter !== 'all') {
            const targetExp = parseInt(experienceFilter);
            filtered = filtered.filter(r => r.experienceLevel === targetExp);
        }

        // Skill filter
        if (skillFilter === 'technical') {
            filtered = filtered.filter(r => r.foundSkills.technical.length > 0);
        } else if (skillFilter === 'soft') {
            filtered = filtered.filter(r => r.foundSkills.soft.length > 0);
        } else if (skillFilter === 'certifications') {
            filtered = filtered.filter(r => r.foundSkills.certifications.length > 0);
        } else if (skillFilter === 'jd_specific') {
            filtered = filtered.filter(r => r.jdSkillMatches > 0);
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
                <strong>Average JD Relevance:</strong> ${stats.avgRelevance}%
            </div>
            <div class="stats-box">
                <strong>High Relevance (≥70%):</strong> ${stats.highRelevance}
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

    getRelevanceClass(score) {
        if (score >= 70) return 'relevance-high';
        if (score >= 40) return 'relevance-medium';
        return 'relevance-low';
    }

    getScoreClass(score) {
        if (score >= 15) return 'score-high';
        if (score >= 8) return 'score-medium';
        return 'score-low';
    }

    getExperienceLabel(level) {
        const labels = {
            1: 'Entry Level',
            2: 'Junior',
            3: 'Mid Level',
            4: 'Senior',
            5: 'Lead/Principal'
        };
        return labels[level] || 'Unknown';
    }

    displayResults(results) {
        const container = document.getElementById("resumeResults");
        container.innerHTML = ""; 

        if (results.length === 0) {
            container.innerHTML = "<p>No resumes match the current filters.</p>";
            return;
        }

        
        results.forEach((result, index) => {
            const div = document.createElement('div');
            div.className = 'result-card';

            const rankingClass = index < 3 ? 'top-candidate' : '';
            div.classList.add(rankingClass);
            
            div.innerHTML = `
                <div class="result-header">
                    <h3>${result.name}</h3>
                    <div class="result-badges">
                        ${index === 0 ? '<span class="badge badge-gold">Top Match</span>' : ''}
                        ${index === 1 ? '<span class="badge badge-silver">2nd Best</span>' : ''}
                        ${index === 2 ? '<span class="badge badge-bronze">3rd Best</span>' : ''}
                    </div>
                </div>
                
                <div class="result-summary">
                    <p><strong>Analysis Summary:</strong> ${result.summary}</p>
                </div>
                
                <div class="result-metrics">
                    <div class="metric-card">
                        <div class="metric-label">JD Relevance</div>
                        <div class="metric-value ${this.getRelevanceClass(result.relevanceScore)}">
                            ${result.relevanceScore}%
                        </div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Overall Score</div>
                        <div class="metric-value ${this.getScoreClass(result.score)}">
                            ${result.score}
                        </div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Experience Level</div>
                        <div class="metric-value">
                            ${this.getExperienceLabel(result.experienceLevel)}
                        </div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">JD Skill Matches</div>
                        <div class="metric-value">
                            ${result.jdSkillMatches}
                        </div>
                    </div>
                </div>
                
                <div class="contact-info">
                    <p><strong>Email:</strong> ${result.email}</p>
                    <p><strong>Phone:</strong> ${result.phone}</p>
                </div>
                
                <div class="skills-section">
                    <h4>Skills Matched:</h4>
                    <div class="skills-grid">
                        <div class="skill-category">
                            <strong>Technical Skills:</strong>
                            <div class="skill-tags">
                                ${result.foundSkills.technical.length > 0 
                                    ? result.foundSkills.technical.map(skill => 
                                        `<span class="skill-tag technical">${skill}</span>`
                                    ).join('')
                                    : '<span class="no-skills">None found</span>'
                                }
                            </div>
                        </div>
                        <div class="skill-category">
                            <strong>Soft Skills:</strong>
                            <div class="skill-tags">
                                ${result.foundSkills.soft.length > 0 
                                    ? result.foundSkills.soft.map(skill => 
                                        `<span class="skill-tag soft">${skill}</span>`
                                    ).join('')
                                    : '<span class="no-skills">None found</span>'
                                }
                            </div>
                        </div>
                        <div class="skill-category">
                            <strong>Certifications:</strong>
                            <div class="skill-tags">
                                ${result.foundSkills.certifications.length > 0 
                                    ? result.foundSkills.certifications.map(skill => 
                                        `<span class="skill-tag certification">${skill}</span>`
                                    ).join('')
                                    : '<span class="no-skills">None found</span>'
                                }
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="additional-info">
                    ${result.gapAnalysis ? `
                        <details class="gap-analysis">
                            <summary><strong>Skill Gaps Analysis</strong></summary>
                            <div class="gap-content">
                                <div class="gap-category">
                                    <strong>Technical Gaps:</strong>
                                    <div class="gap-tags">
                                        ${result.gapAnalysis.technical.length > 0 
                                            ? result.gapAnalysis.technical.map(skill => 
                                                `<span class="gap-tag technical">${skill}</span>`
                                            ).join('')
                                            : '<span class="no-gaps">No gaps identified</span>'
                                        }
                                    </div>
                                </div>
                                <div class="gap-category">
                                    <strong>Soft Skills Gaps:</strong>
                                    <div class="gap-tags">
                                        ${result.gapAnalysis.soft.length > 0 
                                            ? result.gapAnalysis.soft.map(skill => 
                                                `<span class="gap-tag soft">${skill}</span>`
                                            ).join('')
                                            : '<span class="no-gaps">No gaps identified</span>'
                                        }
                                    </div>
                                </div>
                                <div class="gap-category">
                                    <strong>Certification Gaps:</strong>
                                    <div class="gap-tags">
                                        ${result.gapAnalysis.certifications.length > 0 
                                            ? result.gapAnalysis.certifications.map(skill => 
                                                `<span class="gap-tag certification">${skill}</span>`
                                            ).join('')
                                            : '<span class="no-gaps">No gaps identified</span>'
                                        }
                                    </div>
                                </div>
                            </div>
                        </details>
                    ` : ''}
                    
                    <div class="extra-metrics">
                        ${result.salaryEstimate ? `
                            <div class="metric-item">
                                <strong>Estimated Salary:</strong> 
                                <span class="salary-estimate">${result.salaryEstimate}</span>
                            </div>
                        ` : ''}
                        ${result.cultureMatch ? `
                            <div class="metric-item">
                                <strong>Culture Fit:</strong> 
                                <span class="culture-fit">${result.cultureMatch}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            
            container.appendChild(div);
        });

        this.addExportButton(results);
    }

    addExportButton(results) {
        const container = document.getElementById("resumeResults");
        const exportBtn = document.createElement('button');
        exportBtn.className = 'export-btn';
        exportBtn.innerHTML = 'Export Results to CSV';
        exportBtn.onclick = () => this.exportToCSV(results);
        
        container.insertBefore(exportBtn, container.firstChild);
    }

    exportToCSV(results) {
        const headers = [
            'Name', 'Email', 'Phone', 'Overall Score', 'JD Relevance %', 
            'Experience Level', 'JD Skill Matches', 'Technical Skills', 
            'Soft Skills', 'Certifications', 'Estimated Salary', 'Culture Fit'
        ];
        
        const csvContent = [
            headers.join(','),
            ...results.map(result => [
                `"${result.name}"`,
                `"${result.email}"`,
                `"${result.phone}"`,
                result.score,
                result.relevanceScore,
                this.getExperienceLabel(result.experienceLevel),
                result.jdSkillMatches,
                `"${result.foundSkills.technical.join('; ')}"`,
                `"${result.foundSkills.soft.join('; ')}"`,
                `"${result.foundSkills.certifications.join('; ')}"`,
                `"${result.salaryEstimate || 'N/A'}"`,
                `"${result.cultureMatch || 'N/A'}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'resume_analysis_results.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    }
}

document.addEventListener('DOMContentLoaded', () => new ResumeScanner());