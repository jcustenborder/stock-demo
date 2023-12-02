import { Model } from "@swim/model";

export class StockTableModel extends Model {
  constructor() {
    super();
  }

  protected override didInsertChild(child: Model, target: Model | null): void {
    console.log("TableModel, didInsertChild");
    super.didInsertChild(child, target);
    console.log("child:", child);
    console.log("target:", target);
    console.log("this:", this);
  }
}
