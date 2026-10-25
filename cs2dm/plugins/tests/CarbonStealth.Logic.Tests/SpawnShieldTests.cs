using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

/// <summary>Защитата при поява: N секунди без щети, изстрелът/смъртта я свалят, 0 = изключено.</summary>
public class SpawnShieldTests
{
    [Fact]
    public void Пази_точно_толкова_секунди_след_появата()
    {
        var s = new SpawnShield();
        s.Start(3, now: 100.0, seconds: 5);
        Assert.True(s.IsProtected(3, 100.0));
        Assert.True(s.IsProtected(3, 104.99));
        Assert.False(s.IsProtected(3, 105.0));
        Assert.False(s.IsProtected(3, 104.0), "изтеклата защита не се връща");
        Assert.False(s.IsProtected(4, 100.0), "друг слот");
    }

    [Fact]
    public void Изстрелът_и_смъртта_я_свалят_новата_поява_я_връща()
    {
        var s = new SpawnShield();
        s.Start(1, 10.0, 5);
        s.End(1);
        Assert.False(s.IsProtected(1, 10.5));
        s.Start(1, 20.0, 5);
        Assert.True(s.IsProtected(1, 21.0));
        s.Clear();
        Assert.False(s.IsProtected(1, 21.0));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-3)]
    public void Нула_изключва(int seconds)
    {
        var s = new SpawnShield();
        s.Start(2, 0.0, 5);
        s.Start(2, 1.0, seconds);
        Assert.False(s.IsProtected(2, 1.0));
    }

    [Fact]
    public void Над_тавана_се_приклещва()
    {
        var s = new SpawnShield();
        s.Start(0, 0.0, 999);
        Assert.True(s.IsProtected(0, SpawnShield.MaxSeconds - 0.01));
        Assert.False(s.IsProtected(0, SpawnShield.MaxSeconds));
    }
}
