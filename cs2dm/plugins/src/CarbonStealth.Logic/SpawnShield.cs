namespace CarbonStealth.Logic;

/// <summary>
/// Защита при поява: N секунди след респаун играчът не поема щети; първият изстрел я сваля (иначе
/// неуязвим играч стреля безнаказано). Чиста логика по слот и време на играта (Server.CurrentTime) —
/// плъгинът вика Start при player_spawn, End при изстрел/смърт/изход и IsProtected в куката за щети.
/// Не е нишково безопасна — само от игровата нишка.
/// </summary>
public sealed class SpawnShield
{
    public const int MaxSeconds = 15;

    private readonly Dictionary<int, double> _until = new();

    /// <summary>0 или по-малко = изключено; над тавана се приклещва.</summary>
    public void Start(int slot, double now, int seconds)
    {
        if (seconds <= 0)
        {
            _until.Remove(slot);
            return;
        }
        _until[slot] = now + Math.Min(seconds, MaxSeconds);
    }

    public void End(int slot) => _until.Remove(slot);

    public bool IsProtected(int slot, double now)
    {
        if (!_until.TryGetValue(slot, out var until)) return false;
        if (now < until) return true;
        _until.Remove(slot);
        return false;
    }

    public void Clear() => _until.Clear();
}
