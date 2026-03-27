import os
import json

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")

def create_html_for_playwright(script_data: dict, output_filepath: str):
    """
    Reads the base HTML template, injects the JSON script data, and writes to a file.
    script_data is expected to have:
    {
      "title": "string",
      "scenes": [...]
    }
    """
    template_path = os.path.join(TEMPLATE_DIR, "video_template.html")
    
    if not os.path.exists(template_path):
        os.makedirs(TEMPLATE_DIR, exist_ok=True)
        # Create a fallback/default template if it doesn't exist
        print(f"Template not found at {template_path}. Ensure it is created.")
        raise FileNotFoundError(f"Missing {template_path}")

    with open(template_path, 'r', encoding='utf-8') as f:
        html_content = f.read()

    # Inject the JSON into a script tag
    json_str = json.dumps(script_data)
    injection = f"<script>window.SCENE_DATA = {json_str};</script>"
    
    # Insert before the closing head tag, or just append it if somehow missing
    if "</head>" in html_content:
        html_content = html_content.replace("</head>", f"{injection}\n</head>")
    else:
        html_content = injection + "\n" + html_content

    with open(output_filepath, 'w', encoding='utf-8') as f:
        f.write(html_content)

    return output_filepath
