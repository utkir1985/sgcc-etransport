using System.Text;

namespace ETransport.Infrastructure.Integrations;

/// <summary>1C kirill mahsulot nomlarini lotin (o‘zbek) ko‘rinishiga.</summary>
public static class CyrillicToLatin
{
    private static readonly Dictionary<string, string> ProductMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["суюлтирилган газ"] = "Suyultirilgan gaz",
        ["суюлтирилган газ (пропан-бутан)"] = "Suyultirilgan gaz",
        ["этиленнинг полимерлари (полиэтилен)"] = "Etilenning polimerlari (polietilen)",
        ["этиленнинг полимерлари"] = "Etilenning polimerlari (polietilen)",
        ["полиэтилен"] = "Etilenning polimerlari (polietilen)",
        ["барча турдаги олтингугурт"] = "Barcha turdagi oltingugurt",
        ["табиий газ конденсати"] = "Tabiiy gaz kondensati",
        ["бутен-1"] = "Buten-1",
        ["полиэтилен отход"] = "Polietilen otxod",
        ["полиэтилен отьод"] = "Polietilen otxod",
        ["техник пропан"] = "Texnik Propan",
        ["пропан"] = "Texnik Propan",
        ["пропан техник"] = "Texnik Propan",
        ["суг (пропан)"] = "Texnik Propan",
    };

    private static readonly Dictionary<char, string> CharMap = new()
    {
        ['А'] = "A", ['а'] = "a", ['Б'] = "B", ['б'] = "b", ['В'] = "V", ['в'] = "v",
        ['Г'] = "G", ['г'] = "g", ['Д'] = "D", ['д'] = "d", ['Е'] = "E", ['е'] = "e",
        ['Ё'] = "Yo", ['ё'] = "yo", ['Ж'] = "J", ['ж'] = "j", ['З'] = "Z", ['з'] = "z",
        ['И'] = "I", ['и'] = "i", ['Й'] = "Y", ['й'] = "y", ['К'] = "K", ['к'] = "k",
        ['Л'] = "L", ['л'] = "l", ['М'] = "M", ['м'] = "m", ['Н'] = "N", ['н'] = "n",
        ['О'] = "O", ['о'] = "o", ['П'] = "P", ['п'] = "p", ['Р'] = "R", ['р'] = "r",
        ['С'] = "S", ['с'] = "s", ['Т'] = "T", ['т'] = "t", ['У'] = "U", ['у'] = "u",
        ['Ф'] = "F", ['ф'] = "f", ['Х'] = "X", ['х'] = "x", ['Ц'] = "Ts", ['ц'] = "ts",
        ['Ч'] = "Ch", ['ч'] = "ch", ['Ш'] = "Sh", ['ш'] = "sh", ['Щ'] = "Sh", ['щ'] = "sh",
        ['Ъ'] = "", ['ъ'] = "", ['Ы'] = "I", ['ы'] = "i", ['Ь'] = "", ['ь'] = "",
        ['Э'] = "E", ['э'] = "e", ['Ю'] = "Yu", ['ю'] = "yu", ['Я'] = "Ya", ['я'] = "ya",
        ['Ғ'] = "G'", ['ғ'] = "g'", ['Қ'] = "Q", ['қ'] = "q", ['Ҳ'] = "H", ['ҳ'] = "h",
        ['Ў'] = "O'", ['ў'] = "o'",
    };

    public static string ToProductName(string? raw)
    {
        var value = (raw ?? string.Empty).Trim();
        if (value.Length == 0) return string.Empty;

        var key = string.Join(' ', value.ToLowerInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (ProductMap.TryGetValue(key, out var mapped))
            return mapped;

        if (!value.Any(c => CharMap.ContainsKey(c)))
            return value;

        var sb = new StringBuilder(value.Length + 8);
        foreach (var ch in value)
            sb.Append(CharMap.TryGetValue(ch, out var lat) ? lat : ch.ToString());
        return sb.ToString();
    }
}
