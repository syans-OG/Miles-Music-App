import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => path,
  invoke: invokeMock,
}));

describe('Discord Rich Presence synchronization', () => {
  beforeEach(() => {
    invokeMock.mockClear();
  });

  it('does not send another IPC update for ordinary playback progress', async () => {
    vi.resetModules();
    const { usePlayerStore } = await import('../stores/usePlayerStore');
    const { syncDiscordActivity } = await import('../services/discordRpcService');
    usePlayerStore.setState({
      currentTime: 10,
      duration: 180,
      isPlaying: true,
      enableDiscordRpc: true,
    });

    await syncDiscordActivity();
    usePlayerStore.setState({ currentTime: 11 });
    await syncDiscordActivity();

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('forces a timestamp update after an explicit seek', async () => {
    vi.resetModules();
    const { usePlayerStore } = await import('../stores/usePlayerStore');
    const { syncDiscordActivity } = await import('../services/discordRpcService');
    usePlayerStore.setState({
      currentTime: 10,
      duration: 180,
      isPlaying: true,
      enableDiscordRpc: true,
    });

    await syncDiscordActivity();
    usePlayerStore.setState({ currentTime: 90 });
    await syncDiscordActivity(true);

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenLastCalledWith(
      'set_discord_activity',
      expect.objectContaining({ currentTime: 90 }),
    );
  });

  it('persists Discord preferences in Zustand storage', async () => {
    vi.resetModules();
    const { usePlayerStore } = await import('../stores/usePlayerStore');

    usePlayerStore.getState().setEnableDiscordRpc(false);
    usePlayerStore.getState().setDiscordClientId('123456789012345678');

    const stored = JSON.parse(window.localStorage.getItem('aura_music_player_storage') ?? '{}');
    expect(stored.state.enableDiscordRpc).toBe(false);
    expect(stored.state.discordClientId).toBe('123456789012345678');
  });
});
