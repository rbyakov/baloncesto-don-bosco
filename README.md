# Baloncesto · CD Don Bosco B

Сайт со статистикой команды **CD Don Bosco B** (Infantil Masculino, 1ª Zonal, FBCV): игроки, рейтинг команды, таблица группы и путь в Preferente. ES / RU / EN.

## Как это работает

| Что | Откуда | Как часто |
|---|---|---|
| Счёт, календарь, таблица | API FBCV (`esb.optimalwayconsulting.com`), прямо из браузера | при каждом открытии страницы |
| Статистика игроков | API статистики (`msstats.optimalwayconsulting.com`) → `data.json` | GitHub Action: по выходным каждые 30 мин, по будням 4 раза в день |

Статистику игроков браузер напрямую взять не может (сервер отдаёт её только сайту fbcv.es), поэтому её собирает `scripts/build-data.mjs` в GitHub Actions и коммитит в `data.json`. Уже опубликованные протоколы повторно не запрашиваются.

## Настройки — `config.json`

- `teamId` — id команды в FBCV (из адреса `fbcv.es/competiciones/equipo?id=…`)
- `nameStyle` — как показывать имена: `initial` (Makar B.), `first` (Makar), `full` (Makar Biakov)
- `defaultPlayer` — кто открывается по умолчанию
- `extraPlayers` — игроки, которых ещё нет в заявке FBCV (исчезают сами, когда появятся в заявке)

## Ссылки

- `…/#p7` — открыть сразу на игроке с номером 7 (запоминается)
- `…/#team`, `…/#group` — открыть нужную вкладку

## Локально

```sh
node scripts/build-data.mjs   # обновить data.json (Node 20+)
python3 -m http.server        # открыть http://localhost:8000
```

Данные: Federació de Bàsquet de la Comunitat Valenciana (fbcv.es). Неофициальный сайт.
