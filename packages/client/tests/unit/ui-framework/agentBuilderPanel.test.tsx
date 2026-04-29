/**
 * agentBuilderPanel.test.tsx — chat panel integration test.
 *
 * Mocks `fetch` to return a scripted server response, drives the
 * panel as a user would (type prompt, click submit), asserts:
 *   - the panel POSTs the prompt to /api/agent/design
 *   - on success, the returned pack is applied via
 *     loadUIPackOnClient and the active pack reflects it
 *   - on error, the message renders inline
 *
 * Together with `agentCapturedPack.test.tsx` (renders a captured
 * pack) and `devApi.test.tsx` (runtime hot-swap), this completes
 * the trio that proves: agent emits pack → server returns pack →
 * panel applies pack → ManifestHud re-renders.
 */

import React from "react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { AgentBuilderPanel } from "@/ui-framework/AgentBuilderPanel";
import {
  setActiveUIPack,
  getActiveUIPack,
} from "@/ui-framework/uiPackRegistry";

import capturedPackRaw from "./fixtures/agentCapturedPack.json";

const SUCCESS_RESPONSE = {
  ok: true,
  pack: capturedPackRaw,
  finalText: "HUD designed.",
  turns: 4,
  truncated: false,
};

const ERROR_RESPONSE = {
  ok: false,
  error: "Agent loop crashed",
  code: "AGENT_FAILED",
};

describe("AgentBuilderPanel", () => {
  beforeEach(() => {
    setActiveUIPack(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders prompt textarea and disabled submit", () => {
    const r = render(<AgentBuilderPanel />);
    expect(r.getByLabelText(/Describe the UI/i)).toBeTruthy();
    const submit = r.getByRole("button", { name: /Design HUD/i });
    expect(submit.hasAttribute("disabled")).toBe(true);
  });

  it("POSTs to /api/agent/design and applies the returned pack", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SUCCESS_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = render(<AgentBuilderPanel />);
    const textarea = r.getByLabelText(/Describe the UI/i);
    fireEvent.change(textarea, {
      target: { value: "Build me a minimal HUD" },
    });

    const submit = r.getByRole("button", { name: /Design HUD/i });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe("/api/agent/design");
    const body = JSON.parse((init as { body: string }).body);
    expect(body.prompt).toBe("Build me a minimal HUD");

    await waitFor(() => {
      expect(r.getByText(/HUD applied/i)).toBeTruthy();
    });

    // Pack registered + active.
    expect(getActiveUIPack()?.id).toBe("com.hyperforge.minimal-hud");
  });

  it("shows error message when server returns ok=false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(ERROR_RESPONSE), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const r = render(<AgentBuilderPanel />);
    fireEvent.change(r.getByLabelText(/Describe the UI/i), {
      target: { value: "broken request" },
    });
    fireEvent.click(r.getByRole("button", { name: /Design HUD/i }));

    await waitFor(() => {
      expect(r.getByText(/Agent loop crashed/i)).toBeTruthy();
    });
  });

  it("shows error when agent returns null pack", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            pack: null,
            finalText: "no",
            turns: 1,
            truncated: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const r = render(<AgentBuilderPanel />);
    fireEvent.change(r.getByLabelText(/Describe the UI/i), {
      target: { value: "hi" },
    });
    fireEvent.click(r.getByRole("button", { name: /Design HUD/i }));

    await waitFor(() => {
      expect(r.getByText(/didn't propose a pack/i)).toBeTruthy();
    });
  });

  it("calls onPackApplied with the validated pack on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(SUCCESS_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const onApplied = vi.fn();
    const r = render(<AgentBuilderPanel onPackApplied={onApplied} />);
    fireEvent.change(r.getByLabelText(/Describe the UI/i), {
      target: { value: "go" },
    });
    fireEvent.click(r.getByRole("button", { name: /Design HUD/i }));

    await waitFor(() => {
      expect(onApplied).toHaveBeenCalledTimes(1);
    });
  });

  it("invokes onClose when × button clicked", () => {
    const onClose = vi.fn();
    const r = render(<AgentBuilderPanel onClose={onClose} />);
    fireEvent.click(r.getByRole("button", { name: /Close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
