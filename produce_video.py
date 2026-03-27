#!/usr/bin/env python3
"""
D8 Video Production Pipeline for Nosana Axiom Demo
Usage: python3 produce_video.py <live_nosana_url>
Output: demo_video.mp4 (ready to upload to YouTube)
"""

import os
import sys
import time
import requests
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from moviepy import VideoFileClip, AudioFileClip, ImageClip, CompositeVideoClip, concatenate_videoclips

BASE_DIR = Path(__file__).parent
ASSETS_DIR = BASE_DIR / "video_assets"
OUTPUT_FILE = BASE_DIR / "demo_video.mp4"

ELEVENLABS_KEY = open(Path.home() / ".elevenlabs-api-key" if (Path.home() / ".elevenlabs-api-key").exists()
                       else "/opt/autonomous-ai/.elevenlabs-api-key").read().strip()
VOICE_ID = "IKne3meq5aSn9XLyUdCD"  # Charlie — Deep, Confident, Energetic

# ~50-second narration (~100 words at 120wpm accounting for gTTS pace)
NARRATION = """Axiom. A DeFi Security Operations Center on Nosana's decentralized GPU network.

The Dashboard shows live TVL, exploit alerts, and anomaly detection.

The Scanner scores any protocol or contract — paste an Ethereum or Solana address, get a Security Score from zero to one hundred.

The Protocols view monitors multiple positions side by side.

Chat streams AI analysis across twelve custom actions — audit recon, wallet analysis, cross-chain vulnerability assessment.

And Nosana Status shows real job IDs and GPU compute nodes running your agent on-chain.

Security infrastructure. As decentralized as the protocols it protects."""

VIEWS = [
    ("dashboard", "Dashboard — Live DeFi Intelligence"),
    ("scanner", "Scanner — Security Score Engine"),
    ("protocols", "Protocols — Watchlist & Risk"),
    ("chat", "Chat — AI Security Analysis"),
    ("nosana", "Nosana — Decentralized Compute"),
]


def log(msg):
    print(f"[produce_video] {msg}")


def ensure_assets_dir():
    ASSETS_DIR.mkdir(exist_ok=True)


KOKORO_MODEL = Path("/opt/autonomous-ai/models/kokoro/kokoro-v1.0.int8.onnx")
KOKORO_VOICES = Path("/opt/autonomous-ai/models/kokoro/voices-v1.0.bin")


def generate_voiceover():
    """Generate professional voiceover: Kokoro (primary), ElevenLabs (secondary), gTTS (fallback)."""
    vo_path = ASSETS_DIR / "voiceover.mp3"
    if vo_path.exists():
        log(f"Voiceover already exists: {vo_path}")
        return vo_path

    # Primary: Kokoro TTS (local, #1 TTS Arena, no credits needed)
    if KOKORO_MODEL.exists() and KOKORO_VOICES.exists():
        try:
            from kokoro_onnx import Kokoro
            import soundfile as sf
            import numpy as np

            log("Generating voiceover via Kokoro (#1 TTS Arena)...")
            kokoro = Kokoro(str(KOKORO_MODEL), str(KOKORO_VOICES))
            wav_path = ASSETS_DIR / "voiceover.wav"
            samples, sr = kokoro.create(NARRATION.strip(), voice="af_bella", speed=1.0, lang="en-us")
            sf.write(str(wav_path), samples, sr)
            # Convert WAV → MP3
            import subprocess
            subprocess.run(["ffmpeg", "-y", "-i", str(wav_path), "-ab", "192k", str(vo_path)],
                           capture_output=True, check=True)
            wav_path.unlink(missing_ok=True)
            log(f"Kokoro voiceover saved: {vo_path}")
            return vo_path
        except Exception as e:
            log(f"Kokoro failed: {e} — trying ElevenLabs...")

    # Secondary: ElevenLabs
    try:
        log("Generating voiceover via ElevenLabs...")
        r = requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}",
            headers={"xi-api-key": ELEVENLABS_KEY, "Content-Type": "application/json"},
            json={
                "text": NARRATION.strip(),
                "model_id": "eleven_turbo_v2_5",
                "voice_settings": {"stability": 0.45, "similarity_boost": 0.80},
            },
            timeout=60,
        )
        if r.status_code == 200:
            with open(vo_path, "wb") as f:
                f.write(r.content)
            log(f"ElevenLabs voiceover saved: {vo_path} ({len(r.content):,} bytes)")
            return vo_path
        else:
            log(f"ElevenLabs failed ({r.status_code}): {r.text[:200]}")
    except Exception as e:
        log(f"ElevenLabs error: {e}")

    # Last resort: gTTS
    try:
        from gtts import gTTS
        log("Generating voiceover via gTTS (fallback)...")
        tts = gTTS(text=NARRATION.strip(), lang="en", slow=False, tld="co.uk")
        tts.save(str(vo_path))
        log(f"gTTS voiceover saved: {vo_path}")
        return vo_path
    except Exception as e:
        raise RuntimeError(f"All TTS methods failed. Last error: {e}")


def create_title_card():
    """Create title card image."""
    card_path = ASSETS_DIR / "title_card.png"
    if card_path.exists():
        return card_path

    log("Creating title card...")
    img = Image.new("RGB", (1920, 1080), (8, 12, 24))  # Deep navy
    draw = ImageDraw.Draw(img)

    # Background gradient effect
    for y in range(1080):
        alpha = int(255 * (1 - y / 1080) * 0.3)
        draw.line([(0, y), (1920, y)], fill=(0, 255, 150, alpha))

    # Main title
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 120)
        font_medium = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 50)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 36)
    except Exception:
        font_large = font_medium = font_small = ImageFont.load_default()

    # Draw title
    draw.text((960, 380), "AXIOM", font=font_large, fill=(0, 255, 150), anchor="mm")
    draw.text((960, 520), "Decentralized DeFi Security Operations Center", font=font_medium, fill=(180, 220, 255), anchor="mm")
    draw.text((960, 620), "Built on Nosana × ElizaOS", font=font_small, fill=(100, 160, 200), anchor="mm")

    # Powered by line
    draw.text((960, 950), "github.com/marchantdev/agent-challenge", font=font_small, fill=(60, 100, 140), anchor="mm")

    img.save(card_path, "PNG")
    log(f"Title card saved: {card_path}")
    return card_path


def create_closing_card():
    """Create closing card image."""
    card_path = ASSETS_DIR / "closing_card.png"
    if card_path.exists():
        return card_path

    log("Creating closing card...")
    img = Image.new("RGB", (1920, 1080), (8, 12, 24))
    draw = ImageDraw.Draw(img)

    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 80)
        font_medium = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 48)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 36)
    except Exception:
        font_large = font_medium = font_small = ImageFont.load_default()

    draw.text((960, 360), "Security infrastructure as decentralized", font=font_medium, fill=(180, 220, 255), anchor="mm")
    draw.text((960, 430), "as the protocols it protects.", font=font_medium, fill=(180, 220, 255), anchor="mm")
    draw.text((960, 580), "github.com/marchantdev/agent-challenge", font=font_large, fill=(0, 255, 150), anchor="mm")
    draw.text((960, 700), "Nosana × ElizaOS Builders Challenge 2026", font=font_small, fill=(100, 160, 200), anchor="mm")

    img.save(card_path, "PNG")
    log(f"Closing card saved: {card_path}")
    return card_path


def screenshot_views(live_url: str):
    """Screenshot all 5 views using Playwright."""
    import asyncio
    from playwright.async_api import async_playwright

    screenshots = {}

    async def take_shots():
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
            page = await ctx.new_page()

            for view_id, view_label in VIEWS:
                shot_path = ASSETS_DIR / f"view_{view_id}.png"
                if shot_path.exists():
                    log(f"Screenshot already exists: {shot_path}")
                    screenshots[view_id] = shot_path
                    continue

                url = f"{live_url.rstrip('/')}?view={view_id}" if view_id != "dashboard" else live_url
                log(f"Screenshotting {view_label} at {url}...")
                try:
                    await page.goto(url, wait_until="networkidle", timeout=30000)
                    await page.wait_for_timeout(2500)  # Let data load

                    # For scanner view, type a query to show live data
                    if view_id == "scanner":
                        try:
                            inp = page.locator('input[placeholder*="protocol"], input[placeholder*="address"], input[type="text"]').first
                            await inp.fill("uniswap")
                            await inp.press("Enter")
                            await page.wait_for_timeout(3000)
                        except Exception:
                            pass

                    # For chat view, send a message
                    if view_id == "chat":
                        try:
                            inp = page.locator('input[placeholder*="message"], textarea').first
                            await inp.fill("What is the security score for Aave?")
                            await inp.press("Enter")
                            await page.wait_for_timeout(4000)
                        except Exception:
                            pass

                    await page.screenshot(path=str(shot_path), full_page=False)
                    screenshots[view_id] = shot_path
                    log(f"  Saved: {shot_path}")
                except Exception as e:
                    log(f"  WARN: Failed to screenshot {view_id}: {e}")

            await browser.close()

    asyncio.run(take_shots())
    return screenshots


def compose_video(voiceover_path: Path, screenshots: dict):
    """Compose final video from voiceover + screenshots + cards."""
    log("Composing video...")

    title_path = create_title_card()
    closing_path = create_closing_card()

    # Load audio to get total duration
    audio = AudioFileClip(str(voiceover_path))
    total_duration = audio.duration
    log(f"Voiceover duration: {total_duration:.1f}s")

    # Calculate clip timings
    title_duration = 2.5
    closing_duration = 3.0
    view_total = total_duration - title_duration - closing_duration
    view_duration = view_total / len(VIEWS)

    clips = []

    # Title card (2.5s)
    title_clip = ImageClip(str(title_path)).with_duration(title_duration).with_fps(24)
    clips.append(title_clip)

    # View screenshots (equal duration each)
    for view_id, _ in VIEWS:
        if view_id in screenshots:
            shot_path = screenshots[view_id]
            clip = ImageClip(str(shot_path)).with_duration(view_duration).with_fps(24)
            clips.append(clip)
        else:
            # Fallback: black frame with label
            img = Image.new("RGB", (1920, 1080), (20, 25, 40))
            draw = ImageDraw.Draw(img)
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 60)
            except Exception:
                font = ImageFont.load_default()
            draw.text((960, 540), f"[{view_id}]", font=font, fill=(100, 140, 180), anchor="mm")
            tmp = ASSETS_DIR / f"placeholder_{view_id}.png"
            img.save(tmp)
            clip = ImageClip(str(tmp)).with_duration(view_duration).with_fps(24)
            clips.append(clip)

    # Closing card (3s)
    closing_clip = ImageClip(str(closing_path)).with_duration(closing_duration).with_fps(24)
    clips.append(closing_clip)

    # Concatenate (moviepy 2.x API)
    video = concatenate_videoclips(clips, method="compose")
    video = video.with_audio(audio)

    log(f"Rendering video... ({video.duration:.1f}s)")
    video.write_videofile(
        str(OUTPUT_FILE),
        fps=24,
        codec="libx264",
        audio_codec="aac",
        audio_bitrate="192k",
        bitrate="4000k",
        preset="fast",
        logger=None,
    )
    log(f"Video saved: {OUTPUT_FILE}")
    return OUTPUT_FILE


def upload_to_youtube(video_path: Path):
    """Upload to YouTube via the existing youtube_upload.py script."""
    log("Uploading to YouTube...")
    result = subprocess.run(
        [
            "python3",
            "/opt/autonomous-ai/youtube_upload.py",
            "--file", str(video_path),
            "--title", "Axiom — Decentralized DeFi Security Operations Center (Nosana × ElizaOS)",
            "--description", "Axiom is a DeFi Security Operations Center built with ElizaOS and deployed on Nosana's decentralized GPU network. 12 custom actions, cross-chain analysis (ETH + Solana), Security Score API, and a live monitoring dashboard.\n\nBuilt for the Nosana × ElizaOS Builders Challenge 2026.\n\nGitHub: https://github.com/marchantdev/agent-challenge",
            "--category", "28",
            "--privacy", "unlisted",
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode != 0:
        log(f"YouTube upload failed: {result.stderr[:500]}")
        return None
    # Extract URL from output
    for line in result.stdout.splitlines():
        if "youtube.com" in line or "youtu.be" in line:
            return line.strip()
    log(f"Upload output: {result.stdout[:300]}")
    return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 produce_video.py <live_nosana_url>")
        print("       python3 produce_video.py --voiceover-only  (generate just the audio)")
        sys.exit(1)

    voiceover_only = sys.argv[1] == "--voiceover-only"
    use_gtts = "--gtts" in sys.argv
    live_url = None if voiceover_only else sys.argv[1]

    ensure_assets_dir()

    # Step 1: Generate voiceover (can do without live URL)
    vo_path = generate_voiceover(use_gtts=use_gtts)

    if voiceover_only:
        log(f"Voiceover-only mode. Audio at: {vo_path}")
        return

    # Step 2: Screenshot all views
    screenshots = screenshot_views(live_url)
    if not screenshots:
        log("ERROR: No screenshots captured. Check the live URL.")
        sys.exit(1)

    # Step 3: Create static cards
    create_title_card()
    create_closing_card()

    # Step 4: Compose final video
    video_path = compose_video(vo_path, screenshots)

    # Step 5: Upload to YouTube
    yt_url = upload_to_youtube(video_path)
    if yt_url:
        log(f"\nYouTube URL: {yt_url}")
        print(f"\nYOUTUBE_URL={yt_url}")
    else:
        log(f"\nVideo at: {video_path} — upload manually if needed")
        print(f"\nVIDEO_FILE={video_path}")


if __name__ == "__main__":
    main()
