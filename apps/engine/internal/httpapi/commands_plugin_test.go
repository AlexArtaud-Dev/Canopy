package httpapi

import (
	"testing"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
)

func TestCommandEntryNamesItsPlugin(t *testing.T) {
	builtin := toCommandEntry(commands.Entry{ID: "rsync.sync", Mode: commands.ModeBasic})
	if builtin.Plugin != nil {
		t.Fatal("built-in entries have no plugin")
	}
	fromPlugin := toCommandEntry(commands.Entry{
		ID: "tool.run", Mode: commands.ModeBasic,
		Plugin: &commands.PluginRef{ID: "tool", Name: commands.Text{En: "Tool", Fr: "Outil", Es: "Herramienta"}, Devices: []commands.DeviceKind{
			{Kind: "screen", Name: commands.Text{En: "Screens", Fr: "Écrans", Es: "Pantallas"}, Detect: "tool.list", Pair: &commands.DevicePairing{Start: "tool.pair", Code: "tool.code"}},
			{Kind: "speaker", Detect: "tool.speakers"},
		}},
		Params: []commands.Param{{Name: "screen", Type: commands.TypeString, Device: "screen"}},
	})
	if devices := fromPlugin.Plugin.Devices; devices == nil || len(*devices) != 2 || (*devices)[0].Pair == nil || (*devices)[0].Pair.Code != "tool.code" || (*devices)[1].Pair != nil {
		t.Fatalf("devices: %+v", fromPlugin.Plugin.Devices)
	}
	if device := fromPlugin.Params[0].Device; device == nil || *device != "screen" {
		t.Fatalf("device param: %+v", fromPlugin.Params[0])
	}
	if toCommandEntry(commands.Entry{ID: "x.y", Plugin: &commands.PluginRef{ID: "x"}}).Plugin.Devices != nil {
		t.Fatal("no devices declared: none listed")
	}
	targeted := toCommandEntry(commands.Entry{ID: "tool.play", Mode: commands.ModeBasic, Params: []commands.Param{
		{Name: "video", Type: commands.TypePath, Access: commands.AccessRead, On: commands.OnFile, Extensions: []string{"mkv"}},
		{Name: "folder", Type: commands.TypePath, Access: commands.AccessRead},
		{Name: "device", Type: commands.TypeString, ChoicesFrom: "tool.devices"},
		{Name: "port", Type: commands.TypeInt, Advanced: true, Help: &commands.Text{En: "Port", Fr: "Port", Es: "Puerto"}},
	}, Secondary: true})
	if port := targeted.Params[3]; port.Advanced == nil || !*port.Advanced || port.Help == nil || port.Help.Es != "Puerto" {
		t.Fatalf("advanced and help: %+v", port)
	}
	if targeted.Secondary == nil || !*targeted.Secondary || builtin.Secondary != nil || targeted.Params[0].Advanced != nil || targeted.Params[0].Help != nil {
		t.Fatalf("secondary: %+v", targeted)
	}
	if video := targeted.Params[0]; video.On == nil || *video.On != "file" || video.Extensions == nil || (*video.Extensions)[0] != "mkv" {
		t.Fatalf("file target: %+v", video)
	}
	if device := targeted.Params[2]; device.ChoicesFrom == nil || *device.ChoicesFrom != "tool.devices" {
		t.Fatalf("choices: %+v", device)
	}
	if folder := targeted.Params[1]; folder.On != nil || folder.Extensions != nil || folder.ChoicesFrom != nil {
		t.Fatalf("no target: %+v", folder)
	}
	if fromPlugin.Plugin == nil || fromPlugin.Plugin.Id != "tool" || fromPlugin.Plugin.Name.Fr != "Outil" {
		t.Fatalf("plugin: %+v", fromPlugin.Plugin)
	}
}
