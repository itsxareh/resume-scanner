from flask import Flask, request, jsonify, render_template, send_from_directory
import os
import json
import re
from werkzeug.utils import secure_filename
import pdfplumber
from docx import Document
import logging

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  
app.config['UPLOAD_FOLDER'] = 'uploads'

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EMAIL_REGEX = r'\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b'
PHONE_REGEX = r'(\+?\d{1,2}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}'

class ResumeAnalyzer:

    def __init__(self, skills_file="static/js/skills.json"):
        self.skills_file = skills_file
        self.load_industry_data()
    
    def load_industry_data(self):
        if not os.path.exists(self.skills_file):
            raise FileNotFoundError(f"{self.skills_file} not found")
        with open(self.skills_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            self.industry_skills = data.get("industrySkills", {})
            self.industry_keywords = data.get("industryKeywords", {})
    
    def detect_industry(self, job_description):
        """Auto-detect industry based on job description keywords"""
        text = job_description.lower()
        max_score = 0
        detected_industry = 'technology' 
        
        for industry, keywords in self.industry_keywords.items():
            score = 0
            for keyword in keywords:
                matches = len(re.findall(keyword, text, re.IGNORECASE))
                score += matches
            
            if score > max_score:
                max_score = score
                detected_industry = industry
        
        return detected_industry
    
    def clean_text(self, text):
        """Strip extra whitespace, control characters, and artifacts"""
        text = re.sub(r'\s+', ' ', text)
        text = text.replace('\u200b', '')
        return text.strip()
    
    def extract_email(self, text):
        """Extracts a single valid email"""
        match = re.search(EMAIL_REGEX, text)
        return match.group(0) if match else 'Not found'

    def extract_text_from_pdf(self, file_path):
        """Accurate text extraction from PDF using pdfplumber"""
        try:
            text = ""
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            return text
        except Exception as e:
            logger.error(f"Error extracting PDF text: {e}")
            return ""
    
    def extract_text_from_docx(self, file_path):
        """Extract text from DOCX file"""
        try:
            doc = Document(file_path)
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            return text
        except Exception as e:
            logger.error(f"Error extracting DOCX text: {e}")
            return ""
    
    def extract_text_from_txt(self, file_path):
        """Extract text from TXT file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                return file.read()
        except Exception as e:
            logger.error(f"Error extracting TXT text: {e}")
            return ""
    
    def extract_text_from_file(self, file_path, filename):
        """Extract text from uploaded file based on its type"""
        file_ext = filename.lower().split('.')[-1]
        
        if file_ext == 'pdf':
            return self.extract_text_from_pdf(file_path)
        elif file_ext == 'docx':
            return self.extract_text_from_docx(file_path)
        elif file_ext == 'txt':
            return self.extract_text_from_txt(file_path)
        else:
            return ""
    
    def parse_resume_content(self, content, filename):
        """Parse resume content to extract email and phone"""
        cleaned_content = self.clean_text(content)

        email_match = re.search(EMAIL_REGEX, cleaned_content)
        email = email_match.group(0) if email_match else 'Not found'

        phone_match = re.search(PHONE_REGEX, cleaned_content)
        phone = phone_match.group(0) if phone_match else 'Not found'

        return {
            'name': filename,
            'content': cleaned_content,
            'email': email,
            'phone': phone
        }
    
    def identify_skill_gaps(self, found_skills, expected_skills):
        """Identify missing skills"""
        gaps = {}
        for category in expected_skills:
            gaps[category] = [skill for skill in expected_skills[category] 
                            if skill not in found_skills[category]]
        return gaps
    
    def estimate_salary(self, found_skills):
        """Estimate salary based on skills (PHP currency)"""
        base = 20000
        bonus = len(found_skills['technical']) * 1500 + len(found_skills['certifications']) * 2000
        return f"₱{(base + bonus):,}"
    
    def estimate_culture_fit(self, content):
        """Estimate culture fit based on keywords"""
        traits = ['team', 'collaborate', 'value', 'mission', 'diverse', 'inclusive', 'growth']
        score = sum(1 for trait in traits if trait.lower() in content.lower())
        return f"{(score / len(traits) * 100):.0f}% Match"
    
    def generate_summary(self, resume_result):
        """Generate analysis summary"""
        found_skills = resume_result['foundSkills']
        gap_analysis = resume_result.get('gapAnalysis')
        score = resume_result['score']
        salary_estimate = resume_result.get('salaryEstimate')
        culture_match = resume_result.get('cultureMatch')
        
        total_matched = (len(found_skills['technical']) + 
                        len(found_skills['soft']) + 
                        len(found_skills['certifications']))
        
        if total_matched == 0:
            return "This resume doesn't match the job description. Consider adding relevant technical and soft skills."
        
        summary = f"This resume shows a score of {score}, indicating "
        summary += "strong alignment " if total_matched > 5 else "moderate alignment "
        summary += "with the job description. "
        
        if gap_analysis and any(len(gaps) > 0 for gaps in gap_analysis.values()):
            summary += "Some skill gaps exist, especially in "
            non_empty = [category.lower() for category, gaps in gap_analysis.items() if len(gaps) > 0]
            summary += ', '.join(non_empty) + ". "
        
        if salary_estimate:
            summary += f"Estimated salary range is around {salary_estimate}. "
        
        if culture_match:
            summary += f"Culture fit score is {culture_match}. "
        
        return summary
    
    def analyze_resume(self, resume_data, industry, job_description, options):
        """Analyze a single resume"""
        skills = self.industry_skills.get(industry, self.industry_skills['technology'])
        found_skills = {
            'technical': [],
            'soft': [],
            'certifications': []
        }
        
        content_lower = resume_data['content'].lower()
        
        for category, skill_list in skills.items():
            for skill in skill_list:
                if skill.lower() in content_lower:
                    found_skills[category].append(skill)
        
        score = (len(found_skills['technical']) * 2 + 
                len(found_skills['soft']) + 
                len(found_skills['certifications']) * 1.5)
        
        gap_analysis = self.identify_skill_gaps(found_skills, skills) if options.get('skillGaps') else None
        salary_estimate = self.estimate_salary(found_skills) if options.get('salaryInsights') else None
        culture_match = self.estimate_culture_fit(resume_data['content']) if options.get('cultureFit') else None
        
        result = {
            'name': resume_data['name'],
            'email': resume_data['email'],
            'phone': resume_data['phone'],
            'foundSkills': found_skills,
            'score': score,
            'gapAnalysis': gap_analysis,
            'salaryEstimate': salary_estimate,
            'cultureMatch': culture_match
        }
        
        result['summary'] = self.generate_summary(result)
        
        return result

analyzer = ResumeAnalyzer()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/industry-skills/<industry>')
def get_industry_skills(industry):
    """Get skills for a specific industry"""
    skills = analyzer.industry_skills.get(industry, {})
    return jsonify(skills)

@app.route('/analyze', methods=['POST'])
def analyze_resumes():
    """Analyze uploaded resumes"""
    try:
        job_description = request.form.get('jobDescription', '').strip()
        industry = request.form.get('industry', '').strip()
        
        options = {
            'deepAnalysis': request.form.get('deepAnalysis') == 'on',
            'skillGaps': request.form.get('skillGaps') == 'on',
            'salaryInsights': request.form.get('salaryInsights') == 'on',
            'cultureFit': request.form.get('cultureFit') == 'on'
        }
        
        if not job_description or len(job_description) < 10:
            return jsonify({'error': 'Job description is required and must be at least 10 characters long'}), 400
        
        if not industry:
            industry = analyzer.detect_industry(job_description)
        
        uploaded_files = request.files.getlist('resumes')
        if not uploaded_files or all(file.filename == '' for file in uploaded_files):
            return jsonify({'error': 'No files uploaded'}), 400
        
        results = []
        processed_files = []
        
        for file in uploaded_files:
            if file and file.filename != '':
                filename = secure_filename(file.filename)
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(file_path)
                processed_files.append(file_path)
                
                try:
                    content = analyzer.extract_text_from_file(file_path, filename)
                    
                    if content.strip():
                        resume_data = analyzer.parse_resume_content(content, filename)
                        
                        result = analyzer.analyze_resume(resume_data, industry, job_description, options)
                        results.append(result)
                    else:
                        logger.warning(f"No text extracted from {filename}")
                
                except Exception as e:
                    logger.error(f"Error processing {filename}: {e}")
                    continue
        
        for file_path in processed_files:
            try:
                os.remove(file_path)
            except Exception as e:
                logger.error(f"Error removing file {file_path}: {e}")
        
        if not results:
            return jsonify({'error': 'No valid resumes could be processed'}), 400
        
        total = len(results)
        avg_score = sum(r['score'] for r in results) / total if total > 0 else 0
        with_technical = sum(1 for r in results if len(r['foundSkills']['technical']) > 0)
        with_soft = sum(1 for r in results if len(r['foundSkills']['soft']) > 0)
        with_certifications = sum(1 for r in results if len(r['foundSkills']['certifications']) > 0)
        
        response_data = {
            'results': results,
            'stats': {
                'total': total,
                'avgScore': round(avg_score, 2),
                'withTechnicalSkills': with_technical,
                'withSoftSkills': with_soft,
                'withCertifications': with_certifications
            },
            'industry': industry,
            'jobDescription': job_description
        }
        return jsonify(response_data)
    
    except Exception as e:
        logger.error(f"Error in analyze_resumes: {e}")
        return jsonify({'error': 'An error occurred while processing resumes'}), 500

@app.route('/delete-resume', methods=['POST'])
def delete_resume():
    try:
        filename = request.json.get('filename')
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        if os.path.exists(file_path):
            os.remove(file_path)
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File too large. Maximum size is 16MB'}), 413

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)