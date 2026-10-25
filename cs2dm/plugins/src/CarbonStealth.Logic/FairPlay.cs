namespace CarbonStealth.Logic;

/// <summary>Какво да направи плъгинът с играча след една проверка.</summary>
public enum FairPlayVerdict
{
    None,
    /// <summary>Предупреждение (веднъж за всеки период).</summary>
    Warn,
    /// <summary>Преместване при наблюдателите — никога kick.</summary>
    Move,
}

/// <param name="Value">AFK: оставащи секунди до преместването · пинг: средният пинг в ms.</param>
public readonly record struct FairPlayEvent(FairPlayVerdict Verdict, int Value)
{
    public static readonly FairPlayEvent None = new(FairPlayVerdict.None, 0);
}

/// <summary>Едно засичане на входа: натиснати клавиши, накъде гледа и кое тяло (след респаун е ново засичане).</summary>
public readonly record struct InputSample(ulong Buttons, float Pitch, float Yaw, uint Pawn)
{
    /// <summary>Под половин градус — шум (предсказване, закръгляне), не движение на мишката.</summary>
    public const float AngleEpsilon = 0.5f;

    public bool AnglesDifferFrom(InputSample other) =>
        AngleDelta(Pitch, other.Pitch) > AngleEpsilon || AngleDelta(Yaw, other.Yaw) > AngleEpsilon;

    /// <summary>Най-късата разлика между два ъгъла (359° и 1° са на 2°).</summary>
    public static float AngleDelta(float a, float b)
    {
        var d = MathF.Abs(a - b) % 360f;
        return d > 180f ? 360f - d : d;
    }
}

/// <summary>
/// AFK: секунди без вход (смяна на клавишите или на погледа), докато играчът е жив и в отбор. Докато е
/// мъртъв или е изключение, броенето е на пауза — не се нулира, иначе AFK играч, когото убиват, никога не
/// стига прага. След респаун погледът се засича наново (играта сама го завърта). 0 = изключено.
/// Не е нишково безопасен — вика се само от игровата нишка.
/// </summary>
public sealed class AfkTracker(int limitSeconds)
{
    private sealed class Slot
    {
        public InputSample? Last { get; set; }
        public bool WasCounting { get; set; }
        public double Idle { get; set; }
        public bool Warned { get; set; }
    }

    private readonly Dictionary<int, Slot> _slots = new();

    public int LimitSeconds { get; } = Math.Max(0, limitSeconds);

    /// <summary>Предупреждението идва толкова секунди преди преместването (5–20).</summary>
    public int WarnLeadSeconds => Math.Clamp(LimitSeconds / 3, 5, 20);

    /// <param name="elapsedSeconds">Колко време е минало от предишната проверка.</param>
    /// <param name="counting">Жив, в отбор и не е изключение (екип, отворено WASD меню).</param>
    public FairPlayEvent Observe(int slot, InputSample sample, double elapsedSeconds, bool counting)
    {
        if (LimitSeconds == 0) return FairPlayEvent.None;
        if (!_slots.TryGetValue(slot, out var s))
        {
            s = new Slot();
            _slots[slot] = s;
        }
        var last = s.Last;
        var sameBody = s.WasCounting && last is { } l && l.Pawn == sample.Pawn;
        var active = last is { } prev && (prev.Buttons != sample.Buttons || (sameBody && sample.AnglesDifferFrom(prev)));
        s.Last = sample;
        s.WasCounting = counting;
        if (active)
        {
            s.Idle = 0;
            s.Warned = false;
        }
        if (!counting || active) return FairPlayEvent.None;

        s.Idle += Math.Max(0, elapsedSeconds);
        var left = (int)Math.Ceiling(LimitSeconds - s.Idle);
        if (left <= 0)
        {
            _slots.Remove(slot);
            return new FairPlayEvent(FairPlayVerdict.Move, 0);
        }
        if (!s.Warned && left <= WarnLeadSeconds)
        {
            s.Warned = true;
            return new FairPlayEvent(FairPlayVerdict.Warn, left);
        }
        return FairPlayEvent.None;
    }

    public double IdleSeconds(int slot) => _slots.TryGetValue(slot, out var s) ? s.Idle : 0;

    public void Forget(int slot) => _slots.Remove(slot);
}

/// <summary>
/// Висок пинг: средното за последните <paramref name="windowSamples"/> засичания над прага → предупреждение;
/// още <paramref name="graceSamples"/> засичания над прага → наблюдател. Падне ли средното — всичко се
/// прощава. Само играч в отбор се следи (наблюдателят няма какво да разваля). 0 = изключено.
/// </summary>
public sealed class PingMonitor(int maxPing, int windowSamples = 30, int graceSamples = 15)
{
    private sealed class Slot
    {
        public Queue<int> Samples { get; } = new();
        public long Sum { get; set; }
        /// <summary>-1 = без предупреждение; иначе засичания над прага след него.</summary>
        public int SinceWarn { get; set; } = -1;
    }

    private readonly Dictionary<int, Slot> _slots = new();

    public int MaxPing { get; } = Math.Max(0, maxPing);
    public int WindowSamples { get; } = Math.Max(1, windowSamples);
    public int GraceSamples { get; } = Math.Max(1, graceSamples);

    public FairPlayEvent Observe(int slot, int ping, bool counting)
    {
        if (MaxPing == 0) return FairPlayEvent.None;
        if (!counting)
        {
            _slots.Remove(slot);
            return FairPlayEvent.None;
        }
        if (!_slots.TryGetValue(slot, out var s))
        {
            s = new Slot();
            _slots[slot] = s;
        }
        s.Samples.Enqueue(Math.Max(0, ping));
        s.Sum += Math.Max(0, ping);
        if (s.Samples.Count > WindowSamples) s.Sum -= s.Samples.Dequeue();
        if (s.Samples.Count < WindowSamples) return FairPlayEvent.None;

        var average = (int)Math.Round((double)s.Sum / s.Samples.Count, MidpointRounding.AwayFromZero);
        if (average <= MaxPing)
        {
            s.SinceWarn = -1;
            return FairPlayEvent.None;
        }
        if (s.SinceWarn < 0)
        {
            s.SinceWarn = 0;
            return new FairPlayEvent(FairPlayVerdict.Warn, average);
        }
        if (++s.SinceWarn < GraceSamples) return FairPlayEvent.None;
        _slots.Remove(slot);
        return new FairPlayEvent(FairPlayVerdict.Move, average);
    }

    public void Forget(int slot) => _slots.Remove(slot);
}
