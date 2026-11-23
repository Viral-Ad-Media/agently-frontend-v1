import React from 'react';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import SessionSecurity from '../components/SessionSecurity';
import {api} from '../services/api';
vi.mock('../services/api',()=>({api:{listSessions:vi.fn(),revokeSession:vi.fn(),logoutEverywhere:vi.fn()}}));
const sessions=[{id:'current',client:'Browser',current:true,user_agent:'This browser',last_seen_at:new Date().toISOString()},{id:'other',client:'Phone',current:false,user_agent:'Other device',last_seen_at:new Date().toISOString()}];
afterEach(()=>{cleanup();vi.resetAllMocks();localStorage.clear();});
describe('Signed-in devices',()=>{
 it('revokes only the selected other device',async()=>{
  vi.mocked(api.listSessions).mockResolvedValue({sessions,policy:{}} as any);vi.mocked(api.revokeSession).mockResolvedValue({success:true,currentSessionRevoked:false});
  render(<SessionSecurity/>);fireEvent.click(await screen.findByRole('button',{name:'Sign out'}));
  await waitFor(()=>expect(api.revokeSession).toHaveBeenCalledWith('other'));
  expect(api.logoutEverywhere).not.toHaveBeenCalled();
 });
 it('preserves the token and reports an unconfirmed sign-out',async()=>{
  localStorage.setItem('agently.auth.token','synthetic-session');vi.mocked(api.listSessions).mockResolvedValue({sessions,policy:{}} as any);vi.mocked(api.logoutEverywhere).mockRejectedValue(new Error('Sign-out could not be confirmed. Please retry.'));
  render(<SessionSecurity/>);fireEvent.click(await screen.findByRole('button',{name:'Sign out all devices'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be confirmed');expect(localStorage.getItem('agently.auth.token')).toBe('synthetic-session');
 });
});
