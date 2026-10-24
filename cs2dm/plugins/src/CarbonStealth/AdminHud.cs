using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Menu;
using CounterStrikeSharp.API.Modules.Utils;
using Microsoft.Extensions.Logging;

namespace CarbonStealth;

/// <summary>
/// WASD менюто в центъра на екрана: W/S — избор, D или E — потвърди, A — назад, R — затвори.
/// Докато е отворено:
/// - админът стои на място: скоростта е 0 на всеки тик (клиентът я предсказва → без подскачане) и
///   движението е спряно (заради noclip). Хваща и тялото след смърт и респаун в DM;
/// - HTML-ът се праща на всеки тик като CenterHtmlMenu на CSS (иначе Panorama го маха), а страницата
///   се строи наново само при клавиш или на <see cref="HudRebuildTicks"/> тика;
/// - менюто е записано като активно в MenuManager на CSS: DM плъгинът тогава не пише своя център
///   върху нашия (иначе мига), а чуждо меню (напр. !gun) затваря нашето.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private const string HudBrand = "CARBONSTEALTH";
    private const int HudRebuildTicks = 4;

    private static readonly ulong KeyUp = (ulong)PlayerButtons.Forward;
    private static readonly ulong KeyDown = (ulong)PlayerButtons.Back;
    private static readonly ulong KeyBack = (ulong)PlayerButtons.Moveleft;
    private static readonly ulong KeySelect = (ulong)PlayerButtons.Moveright;
    private static readonly ulong KeyUse = (ulong)PlayerButtons.Use;
    private static readonly ulong KeyClose = (ulong)PlayerButtons.Reload;
    private static readonly ulong[] HudKeys = [KeyUp, KeyDown, KeyBack, KeySelect, KeyUse, KeyClose];
    private static readonly IReadOnlySet<ulong> HudRepeat = new HashSet<ulong> { KeyUp, KeyDown };

    /// <summary>Тялото, което държим на място, и движението и скоростта, които важат след менюто.</summary>
    private readonly record struct FrozenPawn(uint Pawn, MoveType_t Was, float Speed);

    private sealed class HudState(HudMenuSession session, IntPtr controller)
    {
        public HudMenuSession Session { get; } = session;
        /// <summary>Ключът в MenuManager (адресът на контролера) — пази се, защото при излизане играчът вече е невалиден.</summary>
        public IntPtr Controller { get; } = controller;
        public KeyRepeater Keys { get; } = new();
        public string Html { get; set; } = " ";
        public int Tick { get; set; }
        public FrozenPawn? Frozen { get; set; }
        public HudMenuMarker? Marker { get; set; }
    }

    /// <summary>
    /// Отметка „има отворено меню“ в MenuManager на CSS. Самото меню рисуваме ние; отметката само казва на
    /// другите плъгини да не пишат в центъра. Reset/Close идват, когато друг плъгин отвори свое меню.
    /// </summary>
    private sealed class HudMenuMarker(Action onClosed) : IMenuInstance
    {
        private static readonly IMenu Placeholder = new ChatMenu(HudBrand);
        private readonly Stack<int> _prevPageOffsets = new();

        IMenu IMenuInstance.Menu => Placeholder;
        CCSPlayerController? IMenuInstance.Player => null;
        bool IMenuInstance.CloseOnSelect => false;
        int IMenuInstance.Page => 0;
        int IMenuInstance.CurrentOffset => 0;
        int IMenuInstance.NumPerPage => 0;
        Stack<int> IMenuInstance.PrevPageOffsets => _prevPageOffsets;

        public void NextPage() { }
        public void PrevPage() { }
        public void Reset() => onClosed();
        public void Close() => onClosed();
        public void Display() { }
        public void OnKeyPress(CCSPlayerController player, int key) { }
    }

    private readonly Dictionary<int, HudState> _huds = new();

    private void RegisterHud() => RegisterListener<Listeners.OnTick>(OnHudTick);

    private void OpenHud(CCSPlayerController player, Func<HudPage> root)
    {
        var slot = player.Slot;
        CloseHud(slot);
        // Едно меню на екрана: чуждо (CSS MenuManager) се затваря.
        MenuManager.CloseActiveMenu(player);
        var state = new HudState(new HudMenuSession(root), player.Handle);
        state.Marker = new HudMenuMarker(() =>
        {
            if (_huds.TryGetValue(slot, out var current) && current == state) CloseHud(slot);
        });
        MenuManager.GetActiveMenus()[player.Handle] = state.Marker;
        _huds[slot] = state;
        HoldStill(player, state);
        RebuildHud(player, state);
    }

    private void CloseHud(int slot)
    {
        if (!_huds.Remove(slot, out var state)) return;
        ReleaseMarker(state);
        var player = Utilities.GetPlayerFromSlot(slot);
        if (player is not { IsValid: true }) return;
        Release(player, state);
        player.PrintToCenterHtml(" ", 1);
    }

    /// <summary>Играчът излезе — само чистим; контролерът му вече не се пипа.</summary>
    private void DropHud(int slot)
    {
        if (_huds.Remove(slot, out var state)) ReleaseMarker(state);
    }

    /// <summary>CSS не чисти MenuManager при излизане, а слотът се преизползва → махаме отметката сами.</summary>
    private static void ReleaseMarker(HudState state)
    {
        var menus = MenuManager.GetActiveMenus();
        if (state.Marker is { } marker && menus.TryGetValue(state.Controller, out var active) && ReferenceEquals(active, marker))
        {
            menus.Remove(state.Controller);
        }
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
                DropHud(slot);
                continue;
            }
            var buttons = player.Pawn.Value?.MovementServices is { } ms ? ms.Buttons.ButtonStates[0] : 0UL;
            var pressed = hud.Keys.Pressed(buttons, time, HudKeys, HudRepeat);
            foreach (var key in pressed)
            {
                if (!HandleHudKey(slot, hud, key)) break;
            }
            if (!IsOpen(slot, hud)) continue;
            HoldStill(player, hud);
            // Страницата (живи HP/K/D) се строи при клавиш или на няколко тика; пращаме я на всеки тик.
            if (pressed.Count > 0 || ++hud.Tick % HudRebuildTicks == 0) RebuildHud(player, hud);
            if (IsOpen(slot, hud)) player.PrintToCenterHtml(hud.Html, 1);
        }
    }

    private bool IsOpen(int slot, HudState hud) => _huds.TryGetValue(slot, out var current) && current == hud;

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
            return IsOpen(slot, hud);
        }
        return true;
    }

    private void RebuildHud(CCSPlayerController player, HudState hud)
    {
        try
        {
            hud.Html = HudMenuRenderer.Render(hud.Session, HudBrand, Localizer.ForPlayer(player, "hud.keys"));
        }
        catch (Exception e)
        {
            // Счупена страница не бива да остави админа замръзнал.
            Logger.LogError(e, "CarbonStealth: HUD page failed");
            CloseHud(player.Slot);
        }
    }

    /// <summary>
    /// Държи админа на място. На всеки тик: играта сама връща скоростта, а при респаун тялото се ражда
    /// с нормално движение. Каквото друго смени движението (респаун, !noclip, изтекъл freeze), важи след менюто.
    /// </summary>
    private static void HoldStill(CCSPlayerController player, HudState hud)
    {
        if (!player.PawnIsAlive || player.PlayerPawn.Value is not { IsValid: true } pawn) return;
        var handle = pawn.EntityHandle.Raw;
        if (hud.Frozen is not { } frozen || frozen.Pawn != handle)
        {
            var was = pawn.MoveType == MoveType_t.MOVETYPE_OBSOLETE ? MoveType_t.MOVETYPE_WALK : pawn.MoveType;
            hud.Frozen = new FrozenPawn(handle, was, pawn.VelocityModifier > 0f ? pawn.VelocityModifier : 1f);
        }
        else if (pawn.MoveType != MoveType_t.MOVETYPE_OBSOLETE)
        {
            hud.Frozen = frozen with { Was = pawn.MoveType };
        }
        if (pawn.MoveType != MoveType_t.MOVETYPE_OBSOLETE) SetMoveType(pawn, MoveType_t.MOVETYPE_OBSOLETE);
        if (pawn.VelocityModifier != 0f) SetSpeed(pawn, 0f);
    }

    /// <summary>Връща движението и скоростта — само на същото тяло.</summary>
    private static void Release(CCSPlayerController player, HudState hud)
    {
        if (hud.Frozen is not { } frozen || player.PlayerPawn.Value is not { IsValid: true } pawn || pawn.EntityHandle.Raw != frozen.Pawn) return;
        if (pawn.MoveType == MoveType_t.MOVETYPE_OBSOLETE) SetMoveType(pawn, frozen.Was);
        SetSpeed(pawn, frozen.Speed);
    }

    private static void SetMoveType(CBasePlayerPawn pawn, MoveType_t type)
    {
        pawn.MoveType = type;
        pawn.ActualMoveType = type;
        Utilities.SetStateChanged(pawn, "CBaseEntity", "m_MoveType");
    }

    private static void SetSpeed(CCSPlayerPawn pawn, float value)
    {
        pawn.VelocityModifier = value;
        Utilities.SetStateChanged(pawn, "CCSPlayerPawn", "m_flVelocityModifier");
    }

    /// <summary>Локализиран низ за HUD (без цветови тагове) — играчът се взима наново по слот.</summary>
    private string L(int slot, string key, params object[] args) =>
        Localizer.ForPlayer(Utilities.GetPlayerFromSlot(slot), key, args);
}
