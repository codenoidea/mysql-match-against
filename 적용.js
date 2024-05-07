"use strict";

const {
  // games,
  sequelize,
  game_search,
} = require("../../../../models/sequelize");

const {
  games,
  data_sequelize,
  games_lowprice,
  games_code,
} = require("../../../../models/sequelize/datadb");

const { Op } = require("sequelize");
const moment = require("moment");
const filterList = require("../v1/filterList");

import * as commonList from "./commonList";

const currentDate = moment();
currentDate.format("YYYY-MM-DD");

function getArrayData(value) {
  return value && value.indexOf(",") > -1
    ? value.replace(/\s+/g, "").split(",")
    : [value.replace(/\s+/g, "")];
}

function getAddWord(value) {
  return value.indexOf(",") > -1
    ? `+${value.replace(/\s+/g, "").replace(/,/gi, " +")}`
    : `+${value.replace(/\s+/g, "")}`;
}

function getExceptWord(value) {
  return value.indexOf(",") > -1
    ? `-${value.replace(/\s+/g, "").replace(/,/gi, " -")}`
    : `-${value.replace(/\s+/g, "")}`;
}

function setMultiSelect(params) {
  const {
    user_id,
    value,
    replacementName,
    searchParallelData,
    gubun,
    replacementObj,
    searchParallelData2,
    route,
  } = params;
  const valueArr = getAddWord(value);

  replacementObj[replacementName] = valueArr;

  const valueSplit = getArrayData(value);

  for (const v of valueSplit) {
    searchParallelData2.push({
      user_id,
      search: v,
      gubun,
      search_date: currentDate.toISOString().substring(0, 10),
      route,
    });
  }
}

async function setGameSearch(params) {
  const t = await sequelize.transaction();
  try {
    const {
      user_id = 0,
      search,
      route = "search",
      recommand,
      price,
      genre,
      platform,
      type,
      playmode,
      vibe,
      language,
      age,
      searchParallelData,
      searchParallelData2,
    } = params;
    const parallelData = [];

    let insertBool = false;
    if (search && route === "search") {
      searchParallelData2.push({
        user_id,
        search,
        gubun: "title",
        search_date: currentDate.toISOString().substring(0, 10),
        route,
      });

      insertBool = true;
    }

    const insertSearchParallData = [];
    for (const p of searchParallelData2) {
      const { user_id, search, gubun, search_date, route } = p;
      insertSearchParallData.push(
        sequelize.query(
          `
          INSERT INTO game_search_history (
            user_id,
            search,
            gubun,
            search_date,
            route) 
          SELECT :user_id as user_id, :search as search, :gubun as gubun, :search_date as search_date, :route as route
          from dual 
          WHERE NOT EXISTS 
            ( SELECT user_id,search,gubun,search_date,route 
            FROM game_search_history 
            WHERE user_id =:user_id and search = :search and gubun = :gubun and search_date = :search_date and route = :route)
          `,
          {
            replacements: { ...p },
            type: sequelize.QueryTypes.INSERT,
          }
        )
      );
    }
    await Promise.all(insertSearchParallData);
    await t.commit();
  } catch (error) {
    await t.rollback();
    console.error(error);
  }
}

async function setWhereRecommand(params) {
  const {
    user_id,
    recommand,
    whereObj,
    searchParallelData,
    replacementObj,
    searchParallelData2,
    route,
  } = params;

  if (recommand) {
    const recommandArr = getArrayData(recommand);

    for (const re of recommandArr) {
      if (re === "expect") {
        const currentDate = new Date();
        const utcDate = currentDate.toISOString().substring(0, 10);

        whereObj["0=0"] = sequelize.literal(
          `STR_TO_DATE(concat(year,lpad(month, 2, '0'),day),'%Y%m%d%') > :curdate`
        );
        replacementObj.curdate = utcDate;
      }
      if (re === "sale") {
        whereObj["0=0"] = sequelize.literal(
          "games_lowprice.discount_percent > 0"
        );
      }
      if (re === "havegame") {
        const haveGameResult = await sequelize.query(
          `
          select game_id from xbox_user_library a 
            join user_game_platform b on a.platform_id = b.platform_id and b.platform='xbox'
              join oper_game_xbox_mapping c on c.source_id = app_id
          where b.user_id=:user_id
          union
          select game_id from steam_user_library a 
            join user_game_platform b on a.platform_id = b.platform_id and b.platform='steam'
              join oper_game_steam_mapping c on c.source_id = app_id
          where b.user_id=:user_id
          union
          select game_id from ps_user_library a 
            join user_game_platform b on a.platform_id = b.platform_id and b.platform='playstation'
              join oper_game_playstation_mapping c on c.source_id = app_id
          where b.user_id=:user_id        
          `,
          { replacements: { user_id } }
        );

        const haveGameArr = [];
        for (const r of haveGameResult[0]) {
          const { game_id } = r;
          haveGameArr.push(`${game_id}`);
        }

        whereObj["0=0"] = sequelize.literal(
          `
          not game_id in (:havegame_id)
          `
        );
        replacementObj.havegame_id = haveGameArr;
      }

      searchParallelData2.push({
        user_id,
        search: re,
        gubun: "recommand",
        search_date: currentDate.toISOString().substring(0, 10),
        route,
      });
    }
  }
}

function setWherePrice(params) {
  const {
    user_id,
    price,
    whereObj,
    searchParallelData,
    searchParallelData2,
    route,
  } = params;
  if (price) {
    const numPrice = Number(price);
    if (numPrice === 0) {
      whereObj["1=1"] = sequelize.literal("games_lowprice.discount_price = 0");
    } else if (numPrice === 10000) {
      whereObj["1=1"] = sequelize.literal(
        "games_lowprice.discount_price between 1 and 10000"
      );
    } else if (numPrice === 20000) {
      whereObj["1=1"] = sequelize.literal(
        "games_lowprice.discount_price between 10000 and 20000"
      );
    } else if (numPrice === 40000) {
      whereObj["1=1"] = sequelize.literal(
        "games_lowprice.discount_price between 20000 and 40000"
      );
    } else if (numPrice === 40001) {
      whereObj["1=1"] = sequelize.literal(
        "games_lowprice.discount_price > 40001"
      );
    }

    searchParallelData2.push({
      user_id,
      search: price,
      gubun: "price",
      search_date: currentDate.toISOString().substring(0, 10),
      route,
    });
  }
}

function setWhereGenre(params) {
  const {
    user_id,
    genre,
    genre_except,
    whereObj,
    replacementObj,
    searchParallelData,
    searchParallelData2,
    route,
  } = params;
  let whereOk = 0;
  let genreArr = "";
  let genreExceptArr = "";

  if (genre) {
    genreArr = getAddWord(genre);
    whereOk += 1;

    for (const g of getArrayData(genre)) {
      searchParallelData2.push({
        user_id,
        search: g,
        gubun: "genre",
        search_date: currentDate.toISOString().substring(0, 10),
        route,
      });
    }
  }

  if (genre_except) {
    genreExceptArr = getExceptWord(genre_except);

    whereOk += 2;

    for (const g of getArrayData(genre_except)) {
      searchParallelData2.push({
        user_id,
        search: g,
        gubun: "genre_except",
        search_date: currentDate.toISOString().substring(0, 10),
        route,
      });
    }
  }

  if (whereOk > 0) {
    whereObj["2=2"] = sequelize.literal(
      "MATCH (games_code.genre) AGAINST (:genreArr in boolean mode)"
    );
    if (whereOk === 1) {
      replacementObj.genreArr = genreArr;
    }
    if (whereOk === 2) {
      const genreExcept = getArrayData(genre_except);

      const genreList = filterList.genreCode;
      const genreSearch = genreList.filter((x) => !genreExcept.includes(x));

      const genreExceptSearch = genreList.filter((x) =>
        genreExcept.includes(x)
      );

      replacementObj.genreArr = `${genreSearch.join(
        " "
      )} -${genreExceptSearch.join(" -")}`;
    }
    if (whereOk === 3) {
      replacementObj.genreArr = genreArr + ` ${genreExceptArr}`;
    }
  }
}

function setWherePlatform(params) {
  const { user_id, platform, whereObj, replacementObj, searchParallelData } =
    params;
  if (platform) {
    whereObj["3=3"] = sequelize.literal(
      "MATCH (games_code.platform) AGAINST (:platformArr in boolean mode)"
    );

    setMultiSelect({
      ...params,
      value: platform,
      gubun: "platform",
      replacementName: "platformArr",
    });
  }
}

function setWhereType(params) {
  const {
    user_id,
    type,
    whereObj,
    searchParallelData,
    searchParallelData2,
    route,
    replacementObj,
  } = params;
  if (type) {
    // whereObj["game_type"] = type.replace(/\s+/g, "");

    whereObj["4=4"] = sequelize.literal("games_code.game_type = :type");
    replacementObj.type = type;
    searchParallelData2.push({
      user_id,
      search: type,
      gubun: "type",
      search_date: currentDate.toISOString().substring(0, 10),
      route,
    });
  }
}

function setWherePlaymode(params) {
  const { user_id, playmode, whereObj, replacementObj, searchParallelData } =
    params;
  if (playmode) {
    whereObj["5=5"] = sequelize.literal(
      "MATCH (games_code.playmode) AGAINST (:playmodeArr in boolean mode)"
    );

    setMultiSelect({
      ...params,
      value: playmode,
      gubun: "playmode",
      replacementName: "playmodeArr",
    });
  }
}

function setWhereVibe(params) {
  const {
    user_id,
    vibe,
    vibe_except,
    whereObj,
    replacementObj,
    searchParallelData,
    searchParallelData2,
    route,
  } = params;
  let whereOk = 0;
  let vibeArr = "";
  let vibeExceptArr = "";

  if (vibe) {
    vibeArr = getAddWord(vibe);

    whereOk += 1;

    for (const v of getArrayData(vibe)) {
      searchParallelData2.push({
        user_id,
        search: v,
        gubun: "vibe",
        search_date: currentDate.toISOString().substring(0, 10),
        route,
      });
    }
  }

  if (vibe_except) {
    vibeExceptArr = getExceptWord(vibe_except);

    whereOk += 2;

    for (const v of getArrayData(vibe_except)) {
      searchParallelData2.push({
        user_id,
        search: v,
        gubun: "vibe_except",
        search_date: currentDate.toISOString().substring(0, 10),
        route,
      });
    }
  }

  if (whereOk > 0) {
    whereObj["6=6"] = sequelize.literal(
      "MATCH (games_code.vibe) AGAINST (:vibeArr in boolean mode)"
    );
    if (whereOk === 1) {
      replacementObj.vibeArr = vibeArr;
    }
    if (whereOk === 2) {
      const vibeList = filterList.vibeCode;
      const vibeExcept = getArrayData(vibe_except);

      const vibeSearch = vibeList.filter((x) => !vibeExcept.includes(x));

      const vibeExceptSearch = vibeList.filter((x) => vibeExcept.includes(x));

      replacementObj.vibeArr = `+${vibeSearch.join(
        " +"
      )} -${vibeExceptSearch.join(" -")}`;
    }
    if (whereOk === 3) {
      replacementObj.vibeArr = vibeArr + ` ${vibeExceptArr}`;
    }
  }
}

function setWhereLanguage(params) {
  const { user_id, language, whereObj, replacementObj, searchParallelData } =
    params;
  if (language) {
    whereObj["7=7"] = sequelize.literal(
      "MATCH (games_code.language) AGAINST (:languageArr in boolean mode)"
    );

    setMultiSelect({
      ...params,
      value: language,
      gubun: "language",
      replacementName: "languageArr",
    });
  }
}

function setWhereAge(params) {
  const {
    user_id,
    age,
    whereObj,
    searchParallelData,
    searchParallelData2,
    route,
  } = params;
  if (age) {
    whereObj["games_code.age"] = age.replace(/\s+/g, "");

    searchParallelData2.push({
      user_id,
      search: age,
      gubun: "age",
      search_date: currentDate.toISOString().substring(0, 10),
      route,
    });
  }
}

export default async function getList(params) {
  try {
    const {
      search,
      route,
      user_id = 0,
      slimit = 40,
      page = 1,
      recommand,
      price,
      genre,
      genre_except,
      platform,
      sorting,
    } = params;

    let limit = Number(slimit);

    let order = [];
    if (route === "gnb") {
      limit = 10;
      order = [
        ["category", "desc"],
        ["main_title", "desc"],
      ];
    }
    if (route === "search") {
      order = [
        [
          sequelize.literal(`
          concat(
            case 
              when year = '9999' then 1111
              when year = '0000' then 1110
                  else cast(year as UNSIGNED) end, 
              case when month is null then 50
              when left(month, 2) = 'q4' then 49
              when cast(month as UNSIGNED) = 12 then 48
                  when cast(month as UNSIGNED) = 11 then 47
                  when cast(month as UNSIGNED) = 10 then 46
                  when instr(month, 'q3,q4') then 39
                  when left(month, 2) = 'q3' then 38
                  when cast(month as UNSIGNED) = 9 then 37
                  when cast(month as UNSIGNED) = 8 then 36
                  when cast(month as UNSIGNED) = 7 then 35
              when instr(month, 'q2,q3') then 29
                  when left(month, 2) = 'q2' then 28
                  when cast(month as UNSIGNED) = 6 then 27
                  when cast(month as UNSIGNED) = 5 then 26
                  when cast(month as UNSIGNED) = 4 then 25
                  when instr(month, 'q1,q2') then 19
                  when left(month, 2) = 'q1' then 18
                  when cast(month as UNSIGNED) = 3 then 17
                  when cast(month as UNSIGNED) = 2 then 16
                  when cast(month as UNSIGNED) = 1 then 15
                  else 1 end ,
            case when day is null then 99
              else lpad(day, 2,'0') end) * 1 desc
          `),
        ],
      ];

      if (sorting === "lowprice") {
        order = [
          [
            sequelize.literal(
              `(case when price then price else 99999999 end )`
            ),
            "asc",
          ],
        ];
      }
      if (sorting === "highprice") {
        order = [["price", "desc"]];
      }
      if (sorting === "hangeul") {
        order = [["main_title", "asc"]];
      }
      if (sorting === "hangeul_desc") {
        order = [["main_title", "desc"]];
      }
    }
    const offset = limit * (page - 1);

    if (route === "gnb" && !search) {
      return [];
    }

    const whereObj = {};
    whereObj["main_title"] = { [Op.ne]: "" };

    const statusArr = ["service"];
    if (["development", "local"].includes(process.env.NODE_ENV)) {
      statusArr.push("develop");
    }
    whereObj.status = { [Op.in]: statusArr };

    const replacementObj = {};
    if (search) {
      whereObj["11=11"] = sequelize.literal(
        `(LOCATE(:search, main_title) > 0 
        or LOCATE(:search, replace(main_title, ' ', '')) > 0
        or LOCATE(left(:search, 3), main_title) > 0
        or LOCATE(:search, sub_title) > 0 
        or LOCATE(:search, replace(sub_title, ' ', '')) > 0)
        `
      );

      order.unshift([
        sequelize.literal(
          `(case when  LOCATE(:search, main_title) > 0  then 1
          when  LOCATE(:search, sub_title) > 0  then 1
          when LOCATE(:search, replace(main_title, ' ', '')) > 0 then 2
          when LOCATE(:search, replace(sub_title, ' ', '')) > 0 then 2
          else 3 end)`
        ),
        "asc",
      ]);
      replacementObj.search = search.replace(/\s+/g, "").replace(/’/gi, "'");
    }

    const searchParallelData = [];
    const searchParallelData2 = [];
    await setWhereRecommand({
      ...params,
      whereObj,
      searchParallelData,
      replacementObj,
      searchParallelData2,
    });
    setWherePrice({
      ...params,
      whereObj,
      searchParallelData,
      searchParallelData2,
    });
    setWhereGenre({
      ...params,
      whereObj,
      replacementObj,
      searchParallelData,
      searchParallelData2,
    });
    setWherePlatform({
      ...params,
      whereObj,
      replacementObj,
      searchParallelData,
      searchParallelData2,
    });
    setWhereType({
      ...params,
      whereObj,
      replacementObj,
      searchParallelData,
      searchParallelData2,
    });
    setWherePlaymode({
      ...params,
      whereObj,
      replacementObj,
      searchParallelData,
      searchParallelData2,
    });
    setWhereVibe({
      ...params,
      whereObj,
      replacementObj,
      searchParallelData,
      searchParallelData2,
    });
    setWhereLanguage({
      ...params,
      whereObj,
      replacementObj,
      searchParallelData,
      searchParallelData2,
    });
    setWhereAge({
      ...params,
      whereObj,
      searchParallelData,
      searchParallelData2,
    });

    const result = await commonList.commonList({
      ...params,
      order,
      limit,
      offset,
      replacements: replacementObj,
      whereObj,
    });

    for (const r of result) {
      r.main_title = r.sub_title;
      r.price_discount = r.price_percent;
      r.price_percent = undefined;
    }

    setGameSearch({ ...params, searchParallelData, searchParallelData2 });

    if (route === "gnb") {
      return result;
    }

    let includeObj = [];

    games.belongsTo(games_lowprice, {
      foreignKey: "game_id",
      targetKey: "game_id",
    });

    includeObj.push({
      model: games_lowprice,
      required: false,
      attributes: ["origin_price", "discount_price", "discount_percent"],
      where: { language: "en" },
    });

    games.belongsTo(games_code, {
      foreignKey: "game_id",
      targetKey: "game_id",
    });

    includeObj.push({
      model: games_code,
      required: true,
      attributes: [["genre", "genre_code"]],
    });
    const totalCount = await games.count({
      include: includeObj,
      where: whereObj,
      replacements: replacementObj,
    });
    return { totalCount, result };
  } catch (error) {
    console.log(error);
    throw error;
  }
}
