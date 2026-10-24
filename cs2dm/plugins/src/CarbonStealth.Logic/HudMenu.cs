using System.Text;

namespace CarbonStealth.Logic;

/// <summary>Как изглежда ред от менюто: обикновен, опасен (бан, kick) или „добър“ (unban, respawn).</summary>
public enum HudTone
{
    Normal,
    Danger,
    Good,
}

/// <summary>Ред в менюто. <see cref="OnSelect"/> = null → само информация (не се избира).</summary>
public sealed record HudItem(string Text, Action? OnSelect, HudTone Tone = HudTone.Normal, string? Detail = null, bool Disabled = false);

/// <summary>Страница: заглавие, подзаглавие (на живо — HP, K/D…) и редове.</summary>
public sealed record HudPage(string Title, string? Subtitle, IReadOnlyList<HudItem> Items);

/// <summary>
/// Навигацията на WASD менюто: стек от страници. Страницата се строи наново при всяко рисуване
/// (данните са на живо), изборът се пази по индекс и се приклещва при промяна на броя редове.
/// </summary>
public sealed class HudMenuSession
{
    public const int VisibleItems = 5;

    private readonly Stack<(Func<HudPage> Build, int Selected)> _stack = new();

    public HudMenuSession(Func<HudPage> root) => _stack.Push((root, 0));

    public int Depth => _stack.Count;

    public void Push(Func<HudPage> page) => _stack.Push((page, 0));

    /// <summary>Назад. false = бяхме на първата страница → менюто се затваря.</summary>
    public bool Back()
    {
        if (_stack.Count <= 1) return false;
        _stack.Pop();
        return true;
    }

    /// <summary>Връща на първата страница (след действие, което приключва поток).</summary>
    public void Home()
    {
        while (_stack.Count > 1) _stack.Pop();
    }

    public HudPage Current(out int selected)
    {
        var (build, sel) = _stack.Peek();
        var page = build();
        selected = page.Items.Count == 0 ? 0 : Math.Clamp(sel, 0, page.Items.Count - 1);
        return page;
    }

    public void Move(int delta)
    {
        var page = Current(out var selected);
        if (page.Items.Count == 0) return;
        var next = ((selected + delta) % page.Items.Count + page.Items.Count) % page.Items.Count;
        var (build, _) = _stack.Pop();
        _stack.Push((build, next));
    }

    /// <summary>Действието на избрания ред (изпълнява го извикващият, за да може то да пипа стека).</summary>
    public Action? Selected()
    {
        var page = Current(out var selected);
        return page.Items.Count == 0 || page.Items[selected].Disabled ? null : page.Items[selected].OnSelect;
    }

    /// <summary>Прозорецът от видими редове около избрания.</summary>
    public static (int Start, int End) Window(int count, int selected)
    {
        if (count <= VisibleItems) return (0, count);
        var start = Math.Clamp(selected - VisibleItems / 2, 0, count - VisibleItems);
        return (start, start + VisibleItems);
    }
}

/// <summary>HTML за центъра на екрана (Panorama разбира font/b/br). Всичко от играчи се екранира.</summary>
public static class HudMenuRenderer
{
    public const string Accent = "#00E5FF";
    public const string Gold = "#FFB000";
    public const string Danger = "#FF4D4D";
    public const string Good = "#3DDC84";
    public const string Text = "#E6EDF3";
    public const string Muted = "#8B98A5";
    public const string Dim = "#4E5A66";

    public static string Escape(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
        {
            sb.Append(ch switch
            {
                '&' => "&amp;",
                '<' => "&lt;",
                '>' => "&gt;",
                '"' => "&quot;",
                '\'' => "&#39;",
                _ when char.IsControl(ch) => "",
                _ => ch.ToString(),
            });
        }
        return sb.ToString();
    }

    /// <param name="footer">Подсказката за клавишите (локализирана, без HTML от играчи).</param>
    public static string Render(HudMenuSession session, string brand, string footer)
    {
        var page = session.Current(out var selected);
        var sb = new StringBuilder(512);
        sb.Append($"<font color='{Accent}'><b>{brand}</b></font>");
        sb.Append($" <font color='{Dim}'>›</font> <font color='{Gold}'><b>{Escape(page.Title)}</b></font><br>");
        if (!string.IsNullOrEmpty(page.Subtitle)) sb.Append($"<font color='{Muted}'>{Escape(page.Subtitle)}</font><br>");

        var (start, end) = HudMenuSession.Window(page.Items.Count, selected);
        if (start > 0) sb.Append($"<font color='{Dim}'>▲</font><br>");
        for (var i = start; i < end; i++)
        {
            var item = page.Items[i];
            var color = item.Disabled ? Dim : item.Tone switch
            {
                HudTone.Danger => Danger,
                HudTone.Good => Good,
                _ => i == selected ? Text : Muted,
            };
            var detail = item.Detail is { Length: > 0 } d ? $" <font color='{Dim}'>· {Escape(d)}</font>" : "";
            if (i == selected)
            {
                sb.Append($"<font color='{Accent}'>▶</font> <font color='{color}'><b>{Escape(item.Text)}</b></font>{detail}<br>");
            }
            else
            {
                sb.Append($"&nbsp;&nbsp;&nbsp;<font color='{color}'>{Escape(item.Text)}</font>{detail}<br>");
            }
        }
        if (end < page.Items.Count) sb.Append($"<font color='{Dim}'>▼</font><br>");
        sb.Append($"<font color='{Dim}'>{footer}</font>");
        return sb.ToString();
    }
}

/// <summary>Натискане на клавиш (преход от пуснат към натиснат) + повтаряне при задържане.</summary>
public sealed class KeyRepeater(double firstDelay = 0.35, double interval = 0.12)
{
    private ulong _prev;
    private readonly Dictionary<ulong, double> _nextRepeat = new();

    /// <summary>Кои от <paramref name="watched"/> клавиши „се натиснаха“ сега (вкл. повторение при задържане).</summary>
    public List<ulong> Pressed(ulong now, double time, IReadOnlyList<ulong> watched, IReadOnlySet<ulong> repeating)
    {
        var pressed = new List<ulong>();
        foreach (var key in watched)
        {
            var down = (now & key) != 0;
            var wasDown = (_prev & key) != 0;
            if (down && !wasDown)
            {
                _nextRepeat[key] = time + firstDelay;
                pressed.Add(key);
            }
            else if (down && repeating.Contains(key) && _nextRepeat.TryGetValue(key, out var at) && time >= at)
            {
                _nextRepeat[key] = time + interval;
                pressed.Add(key);
            }
        }
        _prev = now;
        return pressed;
    }
}
