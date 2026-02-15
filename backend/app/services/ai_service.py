import warnings

# Suppress Google Generative AI deprecation warning
with warnings.catch_warnings():
    warnings.simplefilter("ignore", category=FutureWarning)
    import google.generativeai as genai
from app.config import settings
import json
import re

# Configure Gemini
try:
    if settings.GEMINI_API_KEY:
        genai.configure(api_key=settings.GEMINI_API_KEY)
    else:
        print("⚠️ GEMINI_API_KEY not found in environment variables")
except Exception as e:
    print(f"❌ Failed to configure Gemini: {e}")

class AIService:
    @staticmethod
    async def generate_content(prompt: str, model_name: str = "gemini-2.5-flash") -> str:
        """
        Generate text content from AI.
        """
        try:
            model = genai.GenerativeModel(model_name)
            # Gemini async generation is run in a thread pool executor usually,
            # or we can use the async method if available in recent versions.
            # For `google-generativeai`, `generate_content_async` allows awaiting.
            response = await model.generate_content_async(prompt)
            return response.text
        except Exception as e:
            print(f"❌ AI Generation Error: {e}")
            raise e

    @staticmethod
    async def generate_json(prompt: str, model_name: str = "gemini-2.5-flash") -> dict:
        """
        Generate and parse JSON content from AI.
        Wraps the prompt to ensure JSON output and handles cleaning.
        """
        json_prompt = f"""{prompt}
        
        CRITICAL INSTRUCTION:
        Output ONLY valid JSON.
        Do not include markdown formatting (like ```json ... ```).
        Do not include any explanations or text outside the JSON object/array.
        """
        
        try:
            text = await AIService.generate_content(json_prompt, model_name)
            
            # Clean potential markdown
            cleaned_text = text.strip()
            if cleaned_text.startswith("```json"):
                cleaned_text = cleaned_text[7:]
            if cleaned_text.startswith("```"):
                cleaned_text = cleaned_text[3:]
            if cleaned_text.endswith("```"):
                cleaned_text = cleaned_text[:-3]
            
            cleaned_text = cleaned_text.strip()
            
            # Parse
            return json.loads(cleaned_text)
        except json.JSONDecodeError as e:
            print(f"❌ JSON Parse Error. Response was: {text[:200]}...")
            raise ValueError(f"Failed to parse AI response as JSON: {e}")
        except Exception as e:
            print(f"❌ AI JSON Generation Error: {e}")
            raise e
