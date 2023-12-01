import { ValueDownlink } from "@swim/client";
import { Controller, TraitViewControllerRef, TraitViewControllerSet, TraitViewRef } from "@swim/controller";
import {
  HeaderController,
  HeaderTrait,
  HeaderView,
  RowController,
  TableController,
  TableTrait,
  TableView,
  TextCellTrait,
  TextCellView,
} from "@swim/table";
import { Observes } from "@swim/util";
import { Record as SwimRecord } from "@swim/structure";
import { Uri } from "@swim/uri";
import { Model } from "@swim/model";
import { Property } from "@swim/component";
import debounce from "lodash-es/debounce";
import { StockRowController } from "../row/StockRowController";
import { StockRowView } from "../row/StockRowView";
import { StockRowTrait } from "../row/StockRowTrait";
import { ValueChange, SymbolUpdate } from "../types";

export class StockTableController extends TableController {
  _didSync: boolean = false;
  _symbolsVisibility: Record<string, boolean> = {};

  constructor() {
    super();
    console.log("STableC constructor");
    StockTableController.initFasteners(this);

    const urlParams = new URLSearchParams(window.location.search);

    let host = urlParams.get("host");
    const baseUri = Uri.parse(document.location.href);
    if (!host) {
      host = baseUri
        .base()
        .withScheme(baseUri.schemeName === "https" ? "warps" : "warp")
        .toString();
    }
    const nodeUri = "/symbols";

    // set up and open status downlink
    this.symbolsDownlink.setHostUri(host);
    this.symbolsDownlink.setNodeUri(nodeUri);
    this.symbolsDownlink.open();

    const that: StockTableController = this;

    setTimeout(() => {
      const searchInput = document.getElementById("search-input");
      searchInput?.addEventListener(
        "input",
        debounce(function (e: Event) {
          const searchTerm = (e.target as HTMLInputElement).value.replace(" ", "").toUpperCase();
          const stockSymbols = Object.keys(that._symbolsVisibility);

          stockSymbols.forEach((k) => {
            const visible = that._symbolsVisibility[k];
            if (!searchTerm.length && !visible) {
              // no search term provided and row is unmounted, mounting row
              that.addNewStockRowController(k);
            } else if (visible && !k.startsWith(searchTerm)) {
              // unmounting row which did not match search
              that.removeStockRowController(k);
            } else if (!visible && k.startsWith(searchTerm)) {
              // row is unmounted but row key matches search term, mounting row
              that.addNewStockRowController(k);
            }
          });
        }, 200)
      );
    }, 500);
  }

  protected override didMount(): void {
    console.log("STableC didMount");
  }

  @Property({
    valueType: String,
    value: "",
    didSetValue(newValue, oldValue) {
      console.log("newValue STableC:", newValue);

      this.owner.rows;
    },
  })
  readonly searchTerm!: Property<this, String>;

  @Property({
    valueType: Model,
  })
  readonly tableModel!: Property<this, Model>;

  @TraitViewRef({
    extends: true,
    traitWillAttachRow(rowTrait, targetTrait) {
      this.owner.rows.addTrait(rowTrait, targetTrait, rowTrait.key);
    },
  })
  override readonly table!: TraitViewRef<this, TableTrait, TableView> &
    Observes<TableTrait> &
    Observes<TableView>;

  @TraitViewControllerRef({
    extends: true,
  })
  override readonly header!: TraitViewControllerRef<this, HeaderTrait, HeaderView, HeaderController> &
    TableController["header"];

  @TraitViewControllerSet({
    extends: true,
    controllerDidEnterLeafView(leafView, rowController) {
      leafView.hover.focus(false);
    },
    controllerDidLeaveLeafView(leafView, rowController) {
      leafView.hover.unfocus(false);
    },
    controllerDidPressLeafView(input, event, leafView, rowController) {
      leafView.highlight.toggle();
    },
    attachCellView(cellView, cellController, rowController) {
      super.attachCellView(cellView, cellController, rowController);
      if (cellView.key === "a") {
        cellView.style.color.set("#989898");
      }
    },
    createController(trait) {
      const traitKey = trait?.key ?? "";

      if (trait && traitKey) {
        const stockRowController = new StockRowController(trait, traitKey);
        stockRowController.setKey(traitKey);
        return stockRowController;
      }

      return super.createController(trait);
    },
  })
  override readonly rows!: TraitViewControllerSet<this, StockRowTrait, StockRowView, StockRowController> &
    Observes<RowController> &
    TableController["rows"];

  @ValueDownlink({
    laneUri: `stocks`,
    consumed: true,
    didSet(value: SwimRecord): void {
      const obj = value.toObject() as SymbolUpdate;
      const symbol = obj?.["@update"]?.key ?? "";

      const rowController = this.owner.getChild(symbol, StockRowController);

      if (!rowController && this.owner._symbolsVisibility[symbol] !== false) {
        this.owner.addNewStockRowController(symbol);
      }
    },
  })
  readonly symbolsDownlink!: ValueDownlink<this>;

  removeStockRowController(symbol: string | undefined): void {
    if (!symbol) {
      return;
    }

    this._symbolsVisibility[symbol] = false;

    this.tableModel.value.removeChild(symbol);
  }

  addNewStockRowController(symbol: string): void {
    this._symbolsVisibility[symbol] = true;

    const rowModel = new Model();
    const rowTrait = new StockRowTrait();
    rowModel.setTrait(symbol, rowTrait);

    // Create cells in trait before appending to model to display being set to 'none'
    const symbolCell = rowTrait.getOrCreateCell("symbol", TextCellTrait);
    const priceCell = rowTrait.getOrCreateCell("price", TextCellTrait);
    const volumeCell = rowTrait.getOrCreateCell("volume", TextCellTrait);
    const movementCell = rowTrait.getOrCreateCell("movement", TextCellTrait);

    this.tableModel.value.appendChild(rowModel, symbol);

    const newStockRowController = Object.values(this.rows.controllers).find((c) => c?.key === symbol) as
      | StockRowController
      | undefined;

    if (newStockRowController) {
      newStockRowController.symbolCell.setTrait(symbolCell);
      newStockRowController.priceCell.setTrait(priceCell);
      newStockRowController.volumeCell.setTrait(volumeCell);
      newStockRowController.movementCell.setTrait(movementCell);

      ["symbol", "price", "volume", "movement"].forEach(function (key) {
        const view = Object.values(newStockRowController.row.attachView().leaf.attachView().cells.views).find(
          (v) => v?.key === key
        ) as TextCellView | undefined;
        if (view) {
          (
            newStockRowController[`${key}Cell` as "priceCell"] as TraitViewRef<
              StockRowController,
              TextCellTrait,
              TextCellView
            >
          ).setView(view, null, key);
        }
        if (key === "symbol") {
          newStockRowController.symbolCell.attachView().set({
            content: symbol,
          });
        }
      });
    }
  }
}
