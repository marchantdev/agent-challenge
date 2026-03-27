#!/usr/bin/env python3
"""
D7 Live Deployment Test — Nosana Axiom
Usage: python3 test_live_deployment.py <BASE_URL>
Example: python3 test_live_deployment.py https://abc123.nosana.io

Tests all 12 actions + 5 views + Nosana SDK data + JS errors.
"""

import sys
import json
import time
import asyncio
import requests
from patchright.async_api import async_playwright

BASE_URL = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else None

if not BASE_URL:
    print("Usage: python3 test_live_deployment.py <BASE_URL>")
    sys.exit(1)

RESULTS = []

def check(name, passed, detail=""):
    status = "✅" if passed else "❌"
    RESULTS.append({"name": name, "passed": passed, "detail": detail})
    print(f"  {status} {name}" + (f" — {detail}" if detail else ""))

# ===== API ENDPOINT TESTS =====

def test_api():
    print("\n=== API Endpoint Tests ===")

    # Health check
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=10)
        data = r.json()
        check("GET /health", r.status_code == 200, f"status={data.get('status', '?')}")
    except Exception as e:
        check("GET /health", False, str(e))

    # Security Score API (the composable endpoint)
    try:
        r = requests.get(f"{BASE_URL}/api/security-score/aave", timeout=15)
        data = r.json()
        score = data.get("score", data.get("security_score", None))
        check("GET /api/security-score/aave", r.status_code == 200 and score is not None,
              f"score={score}")
    except Exception as e:
        check("GET /api/security-score/aave", False, str(e))

    # Badge endpoint
    try:
        r = requests.get(f"{BASE_URL}/api/security-score/aave/badge.svg", timeout=15)
        check("GET /api/security-score/aave/badge.svg",
              r.status_code == 200 and "svg" in r.headers.get("content-type", "").lower(),
              f"content-type={r.headers.get('content-type', '?')[:50]}")
    except Exception as e:
        check("GET /api/security-score/aave/badge.svg", False, str(e))

    # Metrics endpoint
    try:
        r = requests.get(f"{BASE_URL}/metrics", timeout=10)
        check("GET /metrics", r.status_code == 200, f"{len(r.text)} bytes")
    except Exception as e:
        check("GET /metrics", False, str(e))


# ===== ELIZAOS ACTION TESTS (via POST /message or /api/message) =====

ACTIONS_TO_TEST = [
    # (description, message_text, expected_keyword)
    # Covers all 12 registered plugin actions — one test per unique action
    ("ASSESS_PROTOCOL_RISK (AI)", "Assess the risk of Aave", "score"),       # assessRiskAction
    ("EXPLAIN_VULNERABILITY", "Explain flash loan attacks", "flash"),          # explainVulnAction
    ("INSPECT_CONTRACT (ETH)", "Scan contract 0xBB9bc244D798123fDe783fCc1C72d3Bb8C189413", "contract"),  # inspectContractAction
    ("SCAN_DEFI_TVL", "Get TVL for Uniswap", "tvl"),                          # scanTvlAction
    ("ANALYZE_WALLET", "Analyze wallet 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "wallet"),  # analyzeWalletAction
    ("MONITOR_PROTOCOL", "Monitor Compound protocol", "monitor"),              # monitorProtocolAction
    ("GET_EXPLOIT_HISTORY", "Get exploit history for DeFi protocols", "exploit"),  # exploitHistoryAction
    ("COMPARE_PROTOCOLS (AI)", "Compare Aave and Compound", "aave"),          # compareProtocolsAction
    ("GENERATE_AUDIT_REPORT (AI)", "Generate audit report for Uniswap", "audit"),  # generateAuditReportAction
    ("NOSANA_STATUS", "Where do you run?", "nosana"),                         # nosanaStatusAction
    ("SCAN_BOUNTIES", "Show me active bug bounty programs", "bounty"),        # scanBountiesAction
    ("AUDIT_RECON", "Recon github.com/aave/aave-v3-core", "commit"),           # auditReconAction
]

def setup_channel():
    """Set up ElizaOS 1.7 channel for messaging. Returns (channel_id, server_id) or (None, None)."""
    TEST_USER_ID = "00000000-0000-0000-0000-000000000001"

    # Step 1: Get agents
    try:
        r = requests.get(f"{BASE_URL}/api/agents", timeout=5)
        if not r.ok:
            return None, None
        agents = r.json().get("data", {}).get("agents", [])
        if not agents:
            return None, None
        agent_id = agents[0]["id"]
    except:
        return None, None

    # Step 2: Get message server
    try:
        r = requests.get(f"{BASE_URL}/api/messaging/message-servers", timeout=5)
        if not r.ok:
            return None, None
        data = r.json()
        servers = data.get("data", {}).get("messageServers", [])
        if not servers:
            return None, None
        server_id = servers[0]["id"]
    except:
        return None, None

    # Step 3: Create channel
    try:
        r = requests.post(f"{BASE_URL}/api/messaging/central-channels",
            json={
                "name": "d7-test",
                "message_server_id": server_id,
                "participantCentralUserIds": [TEST_USER_ID],
                "type": "GROUP",
                "metadata": {"test": True},
            }, timeout=10)
        if not r.ok:
            return None, None
        channel_id = r.json().get("data", {}).get("id")
        if not channel_id:
            return None, None
    except:
        return None, None

    # Step 4: Add agent to channel
    try:
        requests.post(f"{BASE_URL}/api/messaging/central-channels/{channel_id}/agents",
            json={"agentId": agent_id}, timeout=5)
    except:
        pass

    return channel_id, server_id


def send_message_and_wait(channel_id, server_id, text, timeout_secs=90):
    """Send a message to the channel and poll for agent reply. Returns reply text or None."""
    TEST_USER_ID = "00000000-0000-0000-0000-000000000001"

    # Snapshot current agent message count BEFORE sending our message
    prev_agent_count = 0
    try:
        r = requests.get(f"{BASE_URL}/api/messaging/central-channels/{channel_id}/messages?limit=50",
            timeout=5)
        if r.ok:
            msgs_before = r.json().get("data", {}).get("messages", [])
            prev_agent_count = sum(1 for m in msgs_before if m.get("authorId") != TEST_USER_ID)
    except:
        pass

    # Send message
    try:
        r = requests.post(f"{BASE_URL}/api/messaging/central-channels/{channel_id}/messages",
            json={
                "author_id": TEST_USER_ID,
                "content": text,
                "message_server_id": server_id,
                "metadata": {"user_display_name": "D7Test"},
                "source_type": "d7-test",
            }, timeout=15)
        if not r.ok:
            return None
    except:
        return None

    # Poll for a NEW reply (count must exceed prev_agent_count)
    deadline = time.time() + timeout_secs
    while time.time() < deadline:
        time.sleep(3)
        try:
            r = requests.get(f"{BASE_URL}/api/messaging/central-channels/{channel_id}/messages?limit=50",
                timeout=5)
            if not r.ok:
                continue
            msgs = r.json().get("data", {}).get("messages", [])
            agent_msgs = [m for m in msgs if m.get("authorId") != TEST_USER_ID]
            if len(agent_msgs) > prev_agent_count:
                # Return the newest agent message (reply to our message)
                return agent_msgs[-1].get("content", "")
        except:
            pass

    return None


def test_actions():
    print("\n=== ElizaOS Action Tests ===")

    channel_id, server_id = setup_channel()
    if not channel_id:
        check("Message channel setup", False, "Could not create channel")
        for name, _, _ in ACTIONS_TO_TEST:
            check(name, False, "no channel")
        return

    check("Message channel setup", True, f"channel={channel_id[:8]}...")

    for action_name, message, keyword in ACTIONS_TO_TEST:
        try:
            reply = send_message_and_wait(channel_id, server_id, message, timeout_secs=90)

            if reply:
                text = reply.lower()
                has_keyword = keyword.lower() in text
                has_content = len(text) > 50

                check(action_name, has_keyword and has_content,
                      f"len={len(text)}, keyword={'found' if has_keyword else 'MISSING'}")
            else:
                check(action_name, False, "no reply in 90s")
        except Exception as e:
            check(action_name, False, str(e)[:80])

        time.sleep(2)  # Brief pause between requests


# ===== FRONTEND VIEW TESTS =====

VIEWS_TO_TEST = [
    ("/", "Dashboard"),
    ("/chat", "Chat"),
    ("/scanner", "Scanner"),
    ("/protocols", "Protocols"),
    ("/nosana", "Nosana Status"),
]

async def test_views():
    print("\n=== Frontend View Tests ===")
    js_errors = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Collect JS errors
        page.on("pageerror", lambda e: js_errors.append(str(e)))
        page.on("console", lambda msg: (
            js_errors.append(f"console.error: {msg.text}")
            if msg.type == "error" else None
        ))

        for path, view_name in VIEWS_TO_TEST:
            url = BASE_URL + path
            try:
                resp = await page.goto(url, timeout=20000)
                await asyncio.sleep(3)  # Wait for React render

                # Check page loaded
                title = await page.title()
                content = await page.content()

                # Look for React root content (not just loading spinner)
                has_content = len(content) > 1000 and "undefined" not in content[:200]
                no_404 = "404" not in title and "not found" not in title.lower()
                no_crash = "Application error" not in content and "chunk failed" not in content

                check(f"View: {view_name} ({path})",
                      has_content and no_404 and no_crash,
                      f"title='{title[:40]}', content={len(content)}b")
            except Exception as e:
                check(f"View: {view_name} ({path})", False, str(e)[:80])

        await browser.close()

    # Report JS errors
    if js_errors:
        print(f"\n  ⚠️  JS errors detected ({len(js_errors)}):")
        for err in js_errors[:5]:
            print(f"    • {err[:100]}")
        check("Zero JS errors", False, f"{len(js_errors)} errors")
    else:
        check("Zero JS errors", True)


# ===== NOSANA SDK DATA TEST =====

def test_nosana():
    print("\n=== Nosana SDK Data Tests ===")

    # Check Nosana Status via health endpoint (nosanaNode field)
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=15)
        if r.status_code == 200:
            data = r.json()
            nosana_node = data.get("nosanaNode", "")
            model = data.get("model", "")
            has_nosana = bool(nosana_node) and bool(model)
            check("Nosana SDK: health shows node+model",
                  has_nosana,
                  f"node={nosana_node}, model={model[:30]}")
        else:
            check("Nosana SDK: health shows node+model", False, f"HTTP {r.status_code}")
    except Exception as e:
        check("Nosana SDK: health shows node+model", False, str(e)[:80])


# ===== MAIN =====

async def main():
    print(f"\n{'='*60}")
    print(f"D7 LIVE DEPLOYMENT TEST — Nosana Axiom")
    print(f"Target: {BASE_URL}")
    print(f"{'='*60}")

    test_api()
    test_actions()
    await test_views()
    test_nosana()

    # Summary
    passed = sum(1 for r in RESULTS if r["passed"])
    total = len(RESULTS)
    pct = int(passed / total * 100) if total > 0 else 0

    print(f"\n{'='*60}")
    print(f"RESULTS: {passed}/{total} passed ({pct}%)")

    if passed == total:
        print("🎉 D7 COMPLETE — all checks passed!")
    elif pct >= 80:
        failures = [r for r in RESULTS if not r["passed"]]
        print(f"⚠️  {pct}% passed. Failures:")
        for r in failures:
            print(f"  ❌ {r['name']}: {r['detail']}")
    else:
        print("❌ SIGNIFICANT FAILURES — deployment not ready")
        failures = [r for r in RESULTS if not r["passed"]]
        for r in failures:
            print(f"  ❌ {r['name']}: {r['detail']}")

    print(f"{'='*60}")

    # Save results
    with open("/opt/autonomous-ai/d7-test-results.json", "w") as f:
        json.dump({
            "url": BASE_URL,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "passed": passed,
            "total": total,
            "pct": pct,
            "results": RESULTS
        }, f, indent=2)

    return 0 if passed == total else 1

if __name__ == "__main__":
    exit(asyncio.run(main()))
