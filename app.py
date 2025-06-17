from flask import Flask, request, jsonify, render_template, send_from_directory
import os
import json
import re
from werkzeug.utils import secure_filename
import pdfplumber
from docx import Document
import logging
from collections import Counter

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  
app.config['UPLOAD_FOLDER'] = 'uploads'

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EMAIL_REGEX = r'\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b'
PHONE_REGEX = r'(\+?\d{1,2}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}'

class ResumeAnalyzer:

    def __init__(self, skills_file="skills.json"):
        self.skills_file = skills_file
        self.load_industry_data()
    
    def load_industry_data(self):
        if not os.path.exists(self.skills_file):
            raise FileNotFoundError(f"{self.skills_file} not found")
        with open(self.skills_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            self.industry_skills = data.get("industrySkills", {})
            self.industry_keywords = data.get("industryKeywords", {})
    
    def extract_skills_from_job_description(self, job_description):
        jd_lower = job_description.lower()
        
        technical_patterns = [
            r'\b(?:python|java|javascript|react|angular|vue|node\.?js|php|c\+\+|c#|ruby|go|rust|swift|kotlin)\b',
            r'\b(?:html|css|sass|scss|bootstrap|tailwind)\b',
            r'\b(?:mysql|postgresql|mongodb|redis|elasticsearch|sqlite)\b',
            r'\b(?:aws|azure|gcp|docker|kubernetes|jenkins|git|github|gitlab)\b',
            r'\b(?:machine learning|ai|data science|tensorflow|pytorch|pandas|numpy)\b',
            r'\b(?:rest|api|graphql|microservices|agile|scrum|devops)\b'
        ]
        
        soft_skill_patterns = [
            r'\b(?:communication|leadership|teamwork|problem.solving|analytical|creative)\b',
            r'\b(?:time.management|project.management|collaboration|adaptability)\b',
            r'\b(?:critical.thinking|attention.to.detail|customer.service)\b'
        ]
        
        certification_patterns = [
            r'\b(?:aws certified|azure certified|google cloud|pmp|scrum master|cissp)\b',
            r'\b(?:comptia|cisco|microsoft certified|oracle certified)\b'
        ]
        
        extracted_skills = {
            'technical': [],
            'soft': [],
            'certifications': []
        }
        
        # Technical skills
        for pattern in technical_patterns:
            matches = re.findall(pattern, jd_lower, re.IGNORECASE)
            extracted_skills['technical'].extend(matches)
        
        # Soft skills
        for pattern in soft_skill_patterns:
            matches = re.findall(pattern, jd_lower, re.IGNORECASE)
            extracted_skills['soft'].extend(matches)
        
        # Certifications
        for pattern in certification_patterns:
            matches = re.findall(pattern, jd_lower, re.IGNORECASE)
            extracted_skills['certifications'].extend(matches)
        
        # Remove duplicates and clean up
        for category in extracted_skills:
            extracted_skills[category] = list(set(extracted_skills[category]))
        
        return extracted_skills
    
    def extract_requirements_keywords(self, job_description):
        """Extract key requirement words from job description"""
        requirement_patterns = [
            r'required?\s*:?\s*([^.!?]*)',
            r'must\s+have\s*:?\s*([^.!?]*)',
            r'essential\s*:?\s*([^.!?]*)',
            r'minimum\s+(?:requirements?|qualifications?)\s*:?\s*([^.!?]*)',
            r'preferred\s*:?\s*([^.!?]*)',
            r'desired\s*:?\s*([^.!?]*)'
        ]
        
        requirements = []
        for pattern in requirement_patterns:
            matches = re.findall(pattern, job_description, re.IGNORECASE | re.MULTILINE)
            requirements.extend(matches)
        
        keywords = []
        for req in requirements:
            words = re.split(r'[,;•\n\r]+', req.strip())
            for word in words:
                cleaned = re.sub(r'[^\w\s.-]', '', word.strip())
                if len(cleaned) > 2:
                    keywords.append(cleaned.lower())
        
        return list(set(keywords))
    
    def calculate_jd_relevance_score(self, resume_content, job_description):
        """Calculate how relevant the resume is to the specific job description"""
        resume_lower = resume_content.lower()
        jd_lower = job_description.lower()
        
        jd_phrases = []
        words = re.findall(r'\b\w+\b', jd_lower)
        
        for i in range(len(words) - 1):
            phrase = f"{words[i]} {words[i+1]}"
            if len(phrase) > 6:
                jd_phrases.append(phrase)
        
        for i in range(len(words) - 2):
            phrase = f"{words[i]} {words[i+1]} {words[i+2]}"
            if len(phrase) > 10:
                jd_phrases.append(phrase)
        
        phrase_matches = 0
        for phrase in jd_phrases:
            if phrase in resume_lower:
                phrase_matches += 1
        
        total_phrases = len(jd_phrases)
        relevance_score = (phrase_matches / total_phrases * 100) if total_phrases > 0 else 0
        
        return min(relevance_score, 100) 
    
    def get_experience_level_from_jd(self, job_description):
        """Extract experience level requirements from job description"""
        jd_lower = job_description.lower()
        
        exp_patterns = [
            r'(\d+)\s*\+?\s*years?\s+(?:of\s+)?experience',
            r'minimum\s+(\d+)\s+years?',
            r'at least\s+(\d+)\s+years?',
            r'(\d+)\s*-\s*(\d+)\s+years?'
        ]
        
        years_required = []
        for pattern in exp_patterns:
            matches = re.findall(pattern, jd_lower)
            for match in matches:
                if isinstance(match, tuple):
                    years_required.extend([int(x) for x in match if x.isdigit()])
                else:
                    years_required.append(int(match))
        
        if years_required:
            return max(years_required)  
        
        if any(word in jd_lower for word in ['senior', 'lead', 'principal', 'architect']):
            return 5
        elif any(word in jd_lower for word in ['mid', 'intermediate']):
            return 3
        elif any(word in jd_lower for word in ['junior', 'entry', 'associate']):
            return 1
        
        return 2 
    
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

    def clean_phone_number(self, mobile):
        """Clean and normalize Philippine mobile numbers (starts with 09, 11 digits)"""
        mobile_num = re.sub(r'\D', '', mobile)
        
        if len(mobile_num) >= 10:
            last_10 = mobile_num[-10:]
            if last_10[0] == '9':
                mobile_num = '0' + last_10

        if mobile_num.startswith('639') and len(mobile_num) == 12:
            result = '09' + mobile_num[3:]
            return result

        if mobile_num.startswith('9') and len(mobile_num) == 10:
            result = '0' + mobile_num
            return result

        if mobile_num.startswith('09') and len(mobile_num) == 11:
            return mobile_num

        if mobile_num.startswith('+639') and len(mobile_num) == 13:
            result = '09' + mobile_num[4:]
            return result

        return mobile_num

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
        raw_phone = phone_match.group(0) if phone_match else ''

        phone = self.clean_phone_number(raw_phone)

        return {
            'name': filename,
            'content': cleaned_content,
            'email': email,
            'phone': phone
        }
    
    def identify_skill_gaps(self, found_skills, jd_skills, industry_skills):
        """Identify missing skills based on both JD and industry requirements"""
        gaps = {}
        
        for category in ['technical', 'soft', 'certifications']:
            required_skills = set()
            
            if category in jd_skills:
                required_skills.update(jd_skills[category])
            
            if category in industry_skills:
                required_skills.update(industry_skills[category][:5]) 
            
            found_set = set([skill.lower() for skill in found_skills.get(category, [])])
            gaps[category] = [skill for skill in required_skills 
                            if skill.lower() not in found_set]
        
        return gaps
    
    def estimate_salary_based_on_jd(self, found_skills, job_description, experience_level):
        """Estimate salary based on skills and JD context"""
        base = 25000 
        
        exp_multiplier = {
            1: 0.8,  
            2: 1.0,  
            3: 1.3,  
            4: 1.6,  
            5: 2.0   
        }.get(experience_level, 1.0)
        
        tech_bonus = len(found_skills.get('technical', [])) * 2000
        cert_bonus = len(found_skills.get('certifications', [])) * 3000
        soft_bonus = len(found_skills.get('soft', [])) * 500
        
        jd_lower = job_description.lower()
        high_value_keywords = [
            'machine learning', 'ai', 'blockchain', 'cloud architect',
            'devops', 'security', 'data scientist', 'full stack',
            'lead', 'senior', 'principal', 'architect'
        ]
        
        keyword_bonus = sum(5000 for keyword in high_value_keywords if keyword in jd_lower)
        
        total_salary = (base + tech_bonus + cert_bonus + soft_bonus + keyword_bonus) * exp_multiplier
        
        return f"₱{int(total_salary):,}"
    
    def estimate_culture_fit(self, content, job_description):
        """Enhanced culture fit based on both resume and JD"""
        jd_culture_keywords = re.findall(
            r'\b(?:culture|values|team|collaboration|innovation|growth|learning|flexibility|remote|work-life|balance|diversity|inclusion)\b',
            job_description.lower()
        )
        
        standard_traits = [
            'team', 'collaborate', 'integrity', 'respect',
            'growth', 'learning', 'flexibility', 'balance',
            'ownership', 'transparency', 'innovation', 'communication'
        ]
        
        all_traits = list(set(jd_culture_keywords + standard_traits))
        
        content_lower = content.lower()
        matches = sum(1 for trait in all_traits if trait in content_lower)
        
        jd_matches = sum(1 for trait in jd_culture_keywords if trait in content_lower)
        
        total_possible = len(all_traits)
        weighted_score = (matches + jd_matches * 0.5) / (total_possible + len(jd_culture_keywords) * 0.5)
        
        return f"{(weighted_score * 100):.0f}% Match"
    
    def generate_summary(self, resume_result, job_description):
        """Generate enhanced analysis summary"""
        found_skills = resume_result['foundSkills']
        gap_analysis = resume_result.get('gapAnalysis')
        score = resume_result['score']
        relevance_score = resume_result.get('relevanceScore', 0)
        salary_estimate = resume_result.get('salaryEstimate')
        culture_match = resume_result.get('cultureMatch')
        
        total_matched = (len(found_skills.get('technical', [])) + 
                        len(found_skills.get('soft', [])) + 
                        len(found_skills.get('certifications', [])))
        
        if total_matched == 0:
            return "This resume doesn't match the job requirements. Consider adding relevant technical and soft skills mentioned in the job description."
        
        summary = f"This resume shows a relevance score of {relevance_score:.1f}% to the job description "
        summary += f"and an overall skill score of {score:.1f}. "
        
        if relevance_score >= 70:
            summary += "Strong alignment with job requirements. "
        elif relevance_score >= 40:
            summary += "Moderate alignment with job requirements. "
        else:
            summary += "Limited alignment with specific job requirements. "
        
        if gap_analysis and any(len(gaps) > 0 for gaps in gap_analysis.values()):
            critical_gaps = [category for category, gaps in gap_analysis.items() 
                           if len(gaps) > 0 and category == 'technical']
            if critical_gaps:
                summary += "Critical technical skill gaps identified. "
        
        if salary_estimate:
            summary += f"Estimated salary range: {salary_estimate}. "
        
        if culture_match:
            summary += f"Culture fit: {culture_match}."
        
        return summary
    
    def analyze_resume(self, resume_data, industry, job_description, options):
        """Enhanced resume analysis with job description dependency"""
        industry_skills = self.industry_skills.get(industry, self.industry_skills['technology'])
        
        jd_skills = self.extract_skills_from_job_description(job_description)
        
        experience_level = self.get_experience_level_from_jd(job_description)
        
        all_required_skills = {
            'technical': list(set(jd_skills['technical'] + industry_skills.get('technical', []))),
            'soft': list(set(jd_skills['soft'] + industry_skills.get('soft', []))),
            'certifications': list(set(jd_skills['certifications'] + industry_skills.get('certifications', [])))
        }
        
        found_skills = {
            'technical': [],
            'soft': [],
            'certifications': []
        }
        
        content_lower = resume_data['content'].lower()
        
        for category, skill_list in all_required_skills.items():
            for skill in skill_list:
                if skill.lower() in content_lower:
                    found_skills[category].append(skill)
        
        jd_skill_matches = 0
        for category in found_skills:
            for skill in found_skills[category]:
                if skill.lower() in [s.lower() for s in jd_skills.get(category, [])]:
                    jd_skill_matches += 1
        
        base_score = (len(found_skills['technical']) * 2 + 
                     len(found_skills['soft']) + 
                     len(found_skills['certifications']) * 1.5)
        
        relevance_score = self.calculate_jd_relevance_score(resume_data['content'], job_description)
        jd_bonus = (jd_skill_matches * 3) + (relevance_score / 10)
        
        final_score = base_score + jd_bonus
        
        # Optional analyses
        gap_analysis = self.identify_skill_gaps(found_skills, jd_skills, industry_skills) if options.get('skillGaps') else None
        salary_estimate = self.estimate_salary_based_on_jd(found_skills, job_description, experience_level) if options.get('salaryInsights') else None
        culture_match = self.estimate_culture_fit(resume_data['content'], job_description) if options.get('cultureFit') else None
        
        result = {
            'name': resume_data['name'],
            'email': resume_data['email'],
            'phone': resume_data['phone'],
            'foundSkills': found_skills,
            'score': round(final_score, 1),
            'relevanceScore': round(relevance_score, 1),
            'experienceLevel': experience_level,
            'jdSkillMatches': jd_skill_matches,
            'gapAnalysis': gap_analysis,
            'salaryEstimate': salary_estimate,
            'cultureMatch': culture_match
        }
        
        result['summary'] = self.generate_summary(result, job_description)
        
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
    """Analyze uploaded resumes with enhanced JD dependency"""
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
        avg_relevance = sum(r['relevanceScore'] for r in results) / total if total > 0 else 0
        with_technical = sum(1 for r in results if len(r['foundSkills']['technical']) > 0)
        with_soft = sum(1 for r in results if len(r['foundSkills']['soft']) > 0)
        with_certifications = sum(1 for r in results if len(r['foundSkills']['certifications']) > 0)
        high_relevance = sum(1 for r in results if r['relevanceScore'] >= 70)
        
        response_data = {
            'results': sorted(results, key=lambda x: (x['relevanceScore'], x['score']), reverse=True),
            'stats': {
                'total': total,
                'avgScore': round(avg_score, 2),
                'avgRelevance': round(avg_relevance, 2),
                'withTechnicalSkills': with_technical,
                'withSoftSkills': with_soft,
                'withCertifications': with_certifications,
                'highRelevance': high_relevance
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