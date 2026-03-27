import os
import asyncio
from playwright.async_api import async_playwright

async def record_html_video(html_file_path: str, output_video_path: str):
    """
    Given a path to a static HTML file, open it in Playwright, 
    record the viewport (1920x1080), wait for window.RENDER_DONE == true,
    and save the output MP4.
    """
    output_dir = os.path.dirname(output_video_path)
    os.makedirs(output_dir, exist_ok=True)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--mute-audio"
            ]
        )
        
        # Open context with video recording set to 1920x1080
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            record_video_dir=output_dir,
            record_video_size={"width": 1920, "height": 1080}
        )
        
        page = await context.new_page()
        
        # Load the physical file URL
        file_url = f"file://{os.path.abspath(html_file_path)}"
        print(f"🌍 Opening Playwright at {file_url}")
        
        await page.goto(file_url, wait_until="networkidle")
        
        print("⏳ Waiting for window.RENDER_DONE === true...")
        
        # Wait up to 5 minutes (300_000 ms) for the rendering to complete
        try:
            await page.wait_for_function("window.RENDER_DONE === true", timeout=300000)
            print("✅ RENDER_DONE signal received.")
        except Exception as e:
            print(f"❌ Playwright timeout waiting for RENDER_DONE: {e}")
        
        # Close the page and context. This saves the recorded video!
        await page.close()
        
        # Grab generated video path
        video_path = await page.video.path()
        await context.close()
        await browser.close()
        
        # Rename the playwright-generated hash filename to our target name
        if video_path and os.path.exists(video_path):
            if os.path.exists(output_video_path):
                os.remove(output_video_path)
            os.rename(video_path, output_video_path)
            print(f"🎥 Video saved to {output_video_path}")
            return output_video_path
        else:
            raise Exception("Playwright didn't save the video file.")
