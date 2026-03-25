extends Node

# Bus indices — configured in Godot's Audio tab
# Default layout: Master (0), Music (1), SFX (2)
const BUS_MUSIC := "Music"
const BUS_SFX := "SFX"

var music_player: AudioStreamPlayer
var current_track: String = ""

func _ready() -> void:
	music_player = AudioStreamPlayer.new()
	music_player.bus = BUS_MUSIC
	add_child(music_player)

func play_music(path: String, fade_in: float = 0.5) -> void:
	if path == current_track and music_player.playing:
		return
	current_track = path
	var stream := load(path) as AudioStream
	if not stream:
		return
	music_player.stream = stream
	music_player.volume_db = -80.0
	music_player.play()
	var tween := create_tween()
	tween.tween_property(music_player, "volume_db", 0.0, fade_in)

func stop_music(fade_out: float = 0.5) -> void:
	if not music_player.playing:
		return
	var tween := create_tween()
	tween.tween_property(music_player, "volume_db", -80.0, fade_out)
	tween.tween_callback(music_player.stop)
	current_track = ""

func play_sfx(path: String) -> void:
	var stream := load(path) as AudioStream
	if not stream:
		return
	var player := AudioStreamPlayer.new()
	player.bus = BUS_SFX
	player.stream = stream
	add_child(player)
	player.play()
	player.finished.connect(player.queue_free)
