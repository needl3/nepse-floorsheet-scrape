import puppeteer, { Page } from "puppeteer";
import { setTimeout } from "timers/promises";
import { createWriteStream } from "fs";

const NEPSE_URL = "https://nepalstock.com.np/floor-sheet";
const DEFAULT_TIMEOUT = 500; // In ms
const DELIM = ",";

const nextButtonSelector =
  "body > app-root > div > main > div > app-floor-sheet > div > div.table__pagination.d-flex.flex-column.flex-md-row.justify-content-between.align-items-center > div.table__pagination--main.d-flex.mt-3.mt-md-0.align-items-center > pagination-controls > pagination-template > ul > li.pagination-next > a";
const paginationSizeSelector =
  "body > app-root > div > main > div > app-floor-sheet > div > div.box__filter.d-flex.flex-column.flex-md-row.justify-content-between.align-items-md-center > div > div:nth-child(5) > div > select";
const filterButtonSelector =
  "body > app-root > div > main > div > app-floor-sheet > div > div.box__filter.d-flex.flex-column.flex-md-row.justify-content-between.align-items-md-center > div > div.box__filter--btns.mt-md-1 > button.box__filter--search";
const totalPageSelector =
  "body > app-root > div > main > div > app-floor-sheet > div > div.table__pagination.d-flex.flex-column.flex-md-row.justify-content-between.align-items-center > div.table__pagination--main.d-flex.mt-3.mt-md-0.align-items-center > pagination-controls > pagination-template > ul > li:nth-child(9) > a > span:nth-child(2)";
const sortByRateSelector =
  "body > app-root > div > main > div > app-floor-sheet > div > div.table-responsive > table > thead > tr > th:nth-child(7)";

type TableDataType = {
  sn: string;
  contract_no: string;
  stock_symbol: string;
  buyer: string;
  seller: string;
  quantity: string;
  rate: string;
  amount: string;
};

const HEADING = "SN,ContractNo,StockSymbol,Buyer,Seller,Quantity,Rate,Amount\n";

async function extractDataFromPage(
  page: Page,
): Promise<(TableDataType | undefined)[]> {
  await page.waitForSelector("tbody");

  return await page.$$eval("tr", (rows) => {
    return (
      Array.from(rows, (row) => {
        const data = Array.from(
          row.querySelectorAll("td"),
          (column) => column.innerText,
        );
        try {
          return {
            sn: data[0],
            contract_no: data[1],
            stock_symbol: data[2],
            buyer: data[3].replaceAll(",", ""),
            seller: data[4].replaceAll(",", ""),
            quantity: data[5].replaceAll(",", ""),
            rate: data[6].replaceAll(",", ""),
            amount: data[7].replaceAll(",", ""),
          };
        } catch (e) {
          return undefined;
        }
      }) || []
    );
  });
}

async function findTotalPages(page: Page) {
  const totalPageNumber = await page.$$eval(
    totalPageSelector,
    (elem) => elem.at(-1)?.innerHTML || "206",
  );
  return parseInt(totalPageNumber);
}

async function maximizePagination(page: Page) {
  await page.waitForSelector(paginationSizeSelector);
  await page.select("select.ng-untouched.ng-pristine.ng-valid", "500");
  await page.click(filterButtonSelector);
}

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(NEPSE_URL);

  try {
    await maximizePagination(page);

    await page.waitForSelector(sortByRateSelector);
    await page.click(sortByRateSelector);

    const totalPages = await findTotalPages(page);

    const file = createWriteStream(
      new Date().toDateString().replace(" ", "-") + "-floor-data.csv",
    );
    file.write(HEADING);

    const nextButton = await page.waitForSelector(nextButtonSelector);
    for (let i = 0; i < totalPages; i++) {
      const extractedData = await extractDataFromPage(page);
      extractedData.forEach((data) => {
        if (data)
          file.write(
            `${data.sn}${DELIM}${data.contract_no}${DELIM}${data.stock_symbol}${DELIM}${data.buyer}${DELIM}${data.seller}${DELIM}${data.quantity}${DELIM}${data.rate}${DELIM}${data.amount}\n`,
          );
      });
      await nextButton?.click();
      //await setTimeout(DEFAULT_TIMEOUT);
    }
  } catch (e) {
    console.error("Error scraping data: ", e);
  }
  await browser.close();
})();
