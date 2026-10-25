using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

public class CssFlagsTests
{
    private const ulong A = 76561198000000001;

    [Fact]
    public void Правата_растат_с_ролята()
    {
        Assert.Empty(CssFlagMap.For(Role.Player));
        Assert.Empty(CssFlagMap.For(Role.Vip));
        Assert.Equal(["@css/generic"], CssFlagMap.For(Role.Helper).Order());
        Assert.Equal(["@css/chat", "@css/generic", "@css/kick"], CssFlagMap.For(Role.Moderator).Order());
        Assert.Equal(["@css/ban", "@css/chat", "@css/generic", "@css/kick", "@css/slay"], CssFlagMap.For(Role.Admin).Order());
        Assert.Contains("@cheatertroll/admin", CssFlagMap.For(Role.HeadAdmin));
        Assert.DoesNotContain("@cheatertroll/admin", CssFlagMap.For(Role.Admin));
        Assert.True(CssFlagMap.For(Role.Owner).SetEquals(CssFlagMap.All));
    }

    [Fact]
    public void Никога_vip_и_root_при_никоя_роля()
    {
        foreach (var role in Enum.GetValues<Role>())
        {
            Assert.DoesNotContain("@css/vip", CssFlagMap.For(role));
            Assert.DoesNotContain("@css/root", CssFlagMap.For(role));
        }
        Assert.DoesNotContain(CssFlagMap.All, CssFlagMap.Forbidden.Contains);
    }

    [Fact]
    public void Нов_модератор_получава_правата_и_записът_е_наш()
    {
        var ledger = new CssFlagLedger();
        var plan = ledger.Sync(A, Role.Moderator, existing: null);
        Assert.Equal(["@css/chat", "@css/generic", "@css/kick"], plan.Add);
        Assert.Empty(plan.Remove);
        Assert.False(plan.DropEntry);
        Assert.Equal(3, ledger.GrantedTo(A).Count);
    }

    [Fact]
    public void Повторното_опресняване_не_прави_нищо()
    {
        var ledger = new CssFlagLedger();
        ledger.Sync(A, Role.Admin, null);
        var now = CssFlagMap.For(Role.Admin);
        Assert.True(ledger.Sync(A, Role.Admin, now).IsEmpty);
    }

    [Fact]
    public void Понижение_маха_само_излишните_наши_права()
    {
        var ledger = new CssFlagLedger();
        ledger.Sync(A, Role.HeadAdmin, null);
        var plan = ledger.Sync(A, Role.Helper, CssFlagMap.For(Role.HeadAdmin));
        Assert.Empty(plan.Add);
        Assert.Equal(["@cheatertroll/admin", "@css/ban", "@css/chat", "@css/kick", "@css/slay"], plan.Remove);
        Assert.False(plan.DropEntry);
        Assert.Equal(["@css/generic"], ledger.GrantedTo(A));
    }

    [Fact]
    public void Понижение_до_играч_маха_всичко_и_записа_който_сме_създали()
    {
        var ledger = new CssFlagLedger();
        ledger.Sync(A, Role.Moderator, null);
        var plan = ledger.Sync(A, Role.Player, CssFlagMap.For(Role.Moderator));
        Assert.Equal(3, plan.Remove.Count);
        Assert.True(plan.DropEntry);
        Assert.Empty(ledger.Tracked);
    }

    [Fact]
    public void Правата_от_admins_json_не_се_пипат_нито_записът()
    {
        // Собственикът: @css/root и @css/kick от admins.json, ролята в базата — MODERATOR.
        var fromFile = new HashSet<string> { "@css/root", "@css/kick" };
        var ledger = new CssFlagLedger();
        var plan = ledger.Sync(A, Role.Moderator, fromFile);
        Assert.Equal(["@css/chat", "@css/generic"], plan.Add); // kick вече го има — не е наш
        var withOurs = new HashSet<string>(fromFile) { "@css/chat", "@css/generic" };
        var gone = ledger.Forget(A, withOurs);
        Assert.Equal(["@css/chat", "@css/generic"], gone.Remove);
        Assert.False(gone.DropEntry);
    }

    [Fact]
    public void Излизане_маха_нашите_права_и_нашия_запис()
    {
        var ledger = new CssFlagLedger();
        ledger.Sync(A, Role.Admin, null);
        var plan = ledger.Forget(A, CssFlagMap.For(Role.Admin));
        Assert.Equal(5, plan.Remove.Count);
        Assert.True(plan.DropEntry);
        Assert.True(ledger.Forget(A, null).IsEmpty);
    }

    [Fact]
    public void Играч_без_права_не_оставя_следа()
    {
        var ledger = new CssFlagLedger();
        Assert.True(ledger.Sync(A, Role.Player, null).IsEmpty);
        Assert.True(ledger.Sync(A, Role.Vip, null).IsEmpty);
        Assert.Empty(ledger.Tracked);
        Assert.True(ledger.Forget(A, null).IsEmpty);
    }
}
