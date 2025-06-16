class UniversalResumeScanner {
    constructor() {
        this.resumes = [];
        this.jobDescription = '';
        this.selectedIndustry = '';
        this.results = [];
        this.currentFilter = 'all';
        this.initializeEventListeners();
        this.initializeIndustryData();
    }

    async initializeIndustryData() {
        const response = await fetch('js/skills.json');
        const data = await response.json();
        this.industrySkills = data.industrySkills;
        this.industryKeywords = data.industryKeywords;
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

    handleIndustryChange() {
        const selector = document.getElementById('industrySelector');
        const preview = document.getElementById('industryPreview');
        
        if (selector.value) {
            const skills = this.industrySkills[selector.value];
            if (skills) {
                preview.innerHTML = `
                    <strong>Key Skills for ${selector.options[selector.selectedIndex].text}:</strong><br>
                    Technical: ${skills.technical.slice(0, 8).join(', ')}...<br>
                    Soft Skills: ${skills.soft.slice(0, 5).join(', ')}...
                `;
            }
        } else {
            preview.innerHTML = '';
        }
        this.validateInputs();
    }

    detectIndustry(jobDescription) {
        const text = jobDescription.toLowerCase();
        let maxScore = 0;
        let detectedIndustry = 'technology'; 

        for (const [industry, keywords] of Object.entries(this.industryKeywords)) {
            let score = 0;
            keywords.forEach(keyword => {
                const regex = new RegExp(keyword, 'gi');
                const matches = text.match(regex);
                if (matches) score += matches.length;
            });
            
            if (score > maxScore) {
                maxScore = score;
                detectedIndustry = industry;
            }
        }

        return detectedIndustry;
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

    async processFiles(files) {
        const validFiles = files.filter(file => 
            file.type === 'application/pdf' || 
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.type === 'text/plain'
        );

        for (const file of validFiles) {
            try {
                const content = await this.extractTextFromFile(file);
                const resumeData = this.parseResumeContent(content, file.name);
                this.resumes.push(resumeData);
            } catch (error) {
                console.error(`Error processing ${file.name}:`, error);
            }
        }

        this.updateFileList();
        this.validateInputs();
    }

    async extractTextFromFile(file) {
        if (file.type === 'application/pdf') {
            return await this.extractFromPDF(file);
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            return await this.extractFromDOCX(file);
        } else {
            return await this.extractFromTXT(file);
        }
    }

    async extractFromPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        let text = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            text += textContent.items.map(item => item.str).join(' ') + '\n';
        }
        
        return text;
    }

    async extractFromDOCX(file) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({arrayBuffer});
        return result.value;
    }

    async extractFromTXT(file) {
        return await file.text();
    }

    parseResumeContent(content, filename) {
        const lines = content.split('\n').filter(line => line.trim());
        
        const emailMatch = content.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
        
        const phoneMatch = content.match(/(\+?\d{1,2}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);

        return {
            name: filename,
            content,
            email: emailMatch ? emailMatch[0] : 'Not found',
            phone: phoneMatch ? phoneMatch[0] : 'Not found'
        };
    }

    updateFileList() {
        const fileListContainer = document.getElementById('fileList');
        fileListContainer.innerHTML = '';

        this.resumes.forEach(resume => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.textContent = `${resume.name} (${resume.email}, ${resume.phone})`;
            fileListContainer.appendChild(item);
        });
    }

    validateInputs() {
        const jobDesc = document.getElementById('jobDescription').value.trim();
        const analyzeBtn = document.getElementById('analyzeBtn');
        analyzeBtn.disabled = !(this.resumes.length > 0 && jobDesc.length > 10);
    }

    analyzeResumes() {
        const jobDesc = document.getElementById('jobDescription').value.trim();
        const industry = document.getElementById('industrySelector').value || this.detectIndustry(jobDesc);
        const deep = document.getElementById('deepAnalysis').checked;
        const skillGaps = document.getElementById('skillGaps').checked;
        const salary = document.getElementById('salaryInsights').checked;
        const culture = document.getElementById('cultureFit').checked;

        this.jobDescription = jobDesc;
        this.selectedIndustry = industry;

        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('resumeResults').innerHTML = '';

        setTimeout(() => {
            this.results = this.resumes.map(resume => {
                return this.generateResumeReport(resume, industry, jobDesc, { deep, skillGaps, salary, culture });
            });

            this.renderFilters();
            this.renderStats();
            this.displayResults(this.results);
        }, 1000);
    }

    generateResumeReport(resume, industry, jobDesc, options) {
        const skills = this.industrySkills[industry];
        const foundSkills = {
            technical: [],
            soft: [],
            certifications: []
        };

        for (let category in skills) {
            skills[category].forEach(skill => {
                if (resume.content.toLowerCase().includes(skill.toLowerCase())) {
                    foundSkills[category].push(skill);
                }
            });
        }
        

        const gapAnalysis = options.skillGaps ? this.identifySkillGaps(foundSkills, skills) : null;
        const salaryEstimate = options.salary ? this.estimateSalary(foundSkills) : null;
        const cultureMatch = options.culture ? this.estimateCultureFit(resume.content) : null;
        const score = foundSkills.technical.length * 2 + foundSkills.soft.length + foundSkills.certifications.length * 1.5;
        const summary = this.generateSummary({ foundSkills, gapAnalysis, score, salaryEstimate, cultureMatch });

        return {
            name: resume.name,
            email: resume.email,
            phone: resume.phone,
            foundSkills,
            gapAnalysis,
            score,
            salaryEstimate,
            cultureMatch,
            summary
        };
    }

    generateSummary(resumeResult) {
        const { foundSkills, gapAnalysis, score, salaryEstimate, cultureMatch } = resumeResult;
        const totalMatched = foundSkills.technical.length + foundSkills.soft.length + foundSkills.certifications.length;

        if (totalMatched === 0) {
            return "This resume doesn't match the job description. Consider adding relevant technical and soft skills.";
        }

        let summary = `This resume shows a score of ${score}, indicating `;
        summary += totalMatched > 5 ? `strong alignment ` : `moderate alignment `;
        summary += `with the job description. `;

        if (gapAnalysis && Object.values(gapAnalysis).some(arr => arr.length > 0)) {
            summary += `Some skill gaps exist, especially in `;
            const nonEmpty = Object.entries(gapAnalysis)
                .filter(([k, v]) => v.length)
                .map(([k]) => k.toLowerCase());
            summary += nonEmpty.join(', ') + `. `;
        }

        if (salaryEstimate) {
            summary += `Estimated salary range is around ${salaryEstimate}. `;
        }

        if (cultureMatch) {
            summary += `Culture fit score is ${cultureMatch}. `;
        }

        return summary;
    }

    identifySkillGaps(found, expected) {
        const gaps = {};
        for (let category in expected) {
            gaps[category] = expected[category].filter(skill => !found[category].includes(skill));
        }
        return gaps;
    }

    estimateSalary(foundSkills) {
        const base = 20000;
        const bonus = foundSkills.technical.length * 1500 + foundSkills.certifications.length * 2000;
        return `₱${(base + bonus).toLocaleString()}`;
    }

    estimateCultureFit(content) {
        const traits = ['team', 'collaborate', 'value', 'mission', 'diverse', 'inclusive', 'growth'];
        const score = traits.reduce((acc, word) => acc + (content.toLowerCase().includes(word) ? 1 : 0), 0);
        return `${(score / traits.length * 100).toFixed(0)}% Match`;
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
    
    renderStats() {
        const statsContainer = document.getElementById('statsContainer');

        const total = this.results.length;
        const avgScore = (this.results.reduce((acc, r) => acc + r.score, 0) / total || 0).toFixed(2);
        const withTechnicalSkills = this.results.filter(r => r.foundSkills.technical.length > 0).length;
        const withSoftSkills = this.results.filter(r => r.foundSkills.soft.length > 0).length;
        const withCertifications = this.results.filter(r => r.foundSkills.certifications.length > 0).length;

        statsContainer.innerHTML = `
            <div class="stats-box">
                <strong>Total Resumes:</strong> ${total}
            </div>
            <div class="stats-box">
                <strong>Average Score:</strong> ${avgScore}
            </div>
            <div class="stats-box">
                <strong>With Technical Skills:</strong> ${withTechnicalSkills}
            </div>
            <div class="stats-box">
                <strong>With Soft Skills:</strong> ${withSoftSkills}
            </div>
            <div class="stats-box">
                <strong>With Certifications:</strong> ${withCertifications}
            </div>
        `;
    }

    displayResults(results) {
        document.getElementById('loadingIndicator').style.display = 'none';
        const container = document.getElementById("resumeResults");
        container.innerHTML = ""; 

        if (results.length === 0) {
            container.innerHTML = "<p>No resumes found.</p>";
            return;
        }

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