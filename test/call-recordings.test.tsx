import React from "react";
import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CallLogs from "../pages/CallLogs";

const mocks = vi.hoisted(() => ({ recording: vi.fn().mockResolvedValue({recording:{signed_url:"https://example.test/audio.mp3"}}) }));
vi.mock("../services/voiceCallsApi", () => ({voiceCallsApi:{calls:{
  getCalls: async () => ({calls:[],total:0}),
  getCall: async () => ({call:{id:"call-1",status:"completed",direction:"outbound",transcript:[{role:"assistant",text:"Let me connect you."}],recordings:[{sid:"RE-human",phase:"human_transfer",status:"completed",duration:12,transcript:[{speaker:"Speaker A (human transfer)",text:"Please help with my order."},{speaker:"Speaker B (human transfer)",text:"I can help with that."}]}]}}),
  getCallTranscript: async () => [],getCallMessages: async () => [],getCallUnansweredQuestions: async () => [],getCallRecording: mocks.recording,
}}}));

it("lets an owner review and load a human transfer without losing the AI transcript", async () => {
  render(<MemoryRouter initialEntries={["/calls?callId=call-1"]}><CallLogs onDownloadReport={async () => {}} /></MemoryRouter>);
  const selector = await screen.findByLabelText("Conversation segment");
  expect(await screen.findByText("Let me connect you.")).toBeInTheDocument();
  fireEvent.change(selector,{target:{value:"RE-human"}});
  expect(await screen.findByText("Please help with my order.")).toBeInTheDocument();
  expect(screen.getByText("Speaker B (human transfer)")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:/Check recording|Load recording/}));
  await waitFor(()=>expect(mocks.recording).toHaveBeenCalledWith("call-1","RE-human"));
  fireEvent.change(selector,{target:{value:""}});
  expect(await screen.findByText("Let me connect you.")).toBeInTheDocument();
});
