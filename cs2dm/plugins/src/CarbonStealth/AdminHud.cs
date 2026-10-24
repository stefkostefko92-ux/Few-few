using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Utils;
using Microsoft.Extensions.Logging;

namespace CarbonStealth;

/// <summary>
/// WASD менюто в центъра на екрана: W/S — избор, D или E — потвърди, A — назад, R — затвори.
/// Докато е отворено, админът е замръзнал (иначе W/S/A/D го движат). Рисува се наново при промяна
/// и на 16 тика (Panorama маха центъра след 1 s без ново съобщение).
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private const string HudBrand = "CARBONSTEALTH";
    private const int HudResendTicks = 16;

    private static readonly ulong KeyUp = (ulong)PlayerButtons.Forward;
    private static readonly ulong KeyDown = (ulong)PlayerButtons.Back;
    private static readonly ulong KeyBack = (ulong)PlayerButtons.Moveleft;
    private static readonly ulong KeySelect = (ulong)PlayerButtons.Moveright;
    private static readonly ulong KeyUse = (ulong)PlayerButtons.Use;
    private static readonly ulong KeyClose = (ulong)PlayerButtons.Reload;
    private static readonly ulong[] HudKeys = [KeyUp, KeyDown, KeyBack, KeySelect, KeyUse, KeyClose];
    private static readonly IReadOnlySet<ulong> HudRepeat = new HashSet<ulong> { KeyUp, KeyDown };

    private sealed class HudState(HudMenuSession session)
    {
        public HudMenuSession Session { get; } = session;
        public KeyRepeater Keys { get; } = new();
        public string LastHtml { get; set; } = "";
        public int SinceSend { get; set; }
        public int Tick { get; set; }
        /// <summary>Пешката, която замразихме за менюто, и движението ѝ преди това.</summary>
        public (uint Pawn, MoveType_t Was)? Frozen { get; set; }
    }

    private readonly Dictionary<int, HudState> _huds = new();

    private void RegisterHud() => RegisterListener<Listeners.OnTick>(OnHudTick);

    private void OpenHud(CCSPlayerController player, Func<HudPage> root)
    {
        CloseHud(player.Slot);
        var state = new HudState(new HudMenuSession(root));
        if (player.PlayerPawn.Value is { IsValid: true } pawn && player.PawnIsAlive)
        {
            state.Frozen = (pawn.EntityHandle.Raw, pawn.MoveType);
            SetMoveType(pawn, MoveType_t.MOVETYPE_OBSOLETE);
        }
        _huds[player.Slot] = state;
    }

    private void CloseHud(int slot)
    {
        if (!_huds.Remove(slot, out var state)) return;
        var player = Utilities.GetPlayerFromSlot(slot);
        if (player is not { IsValid: true }) return;
        // Връщаме движението само на същата пешка (след смърт пешката е нова и вече се движи).
        if (state.Frozen is { } f && player.PlayerPawn.Value is { IsValid: true } pawn && pawn.EntityHandle.Raw == f.Pawn
            && pawn.MoveType == MoveType_t.MOVETYPE_OBSOLETE)
        {
            SetMoveType(pawn, f.Was);
        }
        player.PrintToCenterHtml(" ", 1);
    }

    private void OnHudTick()
    {
        if (_huds.Count == 0) return;
        var time = Server.CurrentTime;
        foreach (var (slot, hud) in _huds.ToList())
        {
            var player = Utilities.GetPlayerFromSlot(slot);
            if (player is not { IsValid: true } || player.IsBot)
            {
                _huds.Remove(slot);
                continue;
            }
            var buttons = player.Pawn.Value?.MovementServices is { } ms ? ms.Buttons.ButtonStates[0] : 0UL;
            var pressed = hud.Keys.Pressed(buttons, time, HudKeys, HudRepeat);
            foreach (var key in pressed)
            {
                if (!HandleHudKey(slot, hud, key)) break;
            }
            if (!_huds.TryGetValue(slot, out var current) || current != hud) continue;
            // Страницата (живи HP/K/D) се строи наново при клавиш или на 4 тика — не на всеки.
            if (pressed.Count > 0 || ++hud.Tick % 4 == 0) DrawHud(player, hud);
        }
    }

    /// <returns>false = менюто се затвори/смени (спри обработката на клавиши за този тик).</returns>
    private bool HandleHudKey(int slot, HudState hud, ulong key)
    {
        if (key == KeyUp) hud.Session.Move(-1);
        else if (key == KeyDown) hud.Session.Move(1);
        else if (key == KeyClose)
        {
            CloseHud(slot);
            return false;
        }
        else if (key == KeyBack && !hud.Session.Back())
        {
            CloseHud(slot);
            return false;
        }
        else if (key == KeySelect || key == KeyUse)
        {
            hud.Session.Selected()?.Invoke();
            return _huds.TryGetValue(slot, out var still) && still == hud;
        }
        return true;
    }

    private void DrawHud(CCSPlayerController player, HudState hud)
    {
        string html;
        try
        {
            html = HudMenuRenderer.Render(hud.Session, HudBrand, Localizer.ForPlayer(player, "hud.keys"));
        }
        catch (Exception e)
        {
            // Счупена страница не бива да остави админа замръзнал.
            Logger.LogError(e, "CarbonStealth: HUD page failed");
            CloseHud(player.Slot);
            return;
        }
        hud.SinceSend += 4;
        if (html == hud.LastHtml && hud.SinceSend < HudResendTicks) return;
        hud.LastHtml = html;
        hud.SinceSend = 0;
        player.PrintToCenterHtml(html, 1);
    }

    private static void SetMoveType(CBasePlayerPawn pawn, MoveType_t type)
    {
        pawn.MoveType = type;
        pawn.ActualMoveType = type;
        Utilities.SetStateChanged(pawn, "CBaseEntity", "m_MoveType");
    }

    /// <summary>Локализиран низ за HUD (без цветови тагове) — играчът се взима наново по слот.</summary>
    private string L(int slot, string key, params object[] args) =>
        Localizer.ForPlayer(Utilities.GetPlayerFromSlot(slot), key, args);
}
