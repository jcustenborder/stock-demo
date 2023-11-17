package io.nstream.demos.stocks.data;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import swim.api.SwimLane;
import swim.api.agent.AbstractAgent;
import swim.api.lane.CommandLane;
import swim.api.lane.ValueLane;
import swim.concurrent.TimerRef;
import swim.structure.Item;
import swim.structure.Value;
import swim.util.Builder;

import java.util.ArrayList;
import java.util.List;
import java.util.Spliterator;
import java.util.Spliterators;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

public class TwelveDataApiAgent extends AbstractAgent {
  TwelveDataClient client;
  private static final Logger log = LoggerFactory.getLogger(TwelveDataApiAgent.class);

  private ExecutorService executor;

  @Override
  public void willStart() {
    log.trace("willStart() - ");
    String token = System.getenv("TOKEN");

    this.executor = Executors.newFixedThreadPool(4);

    if (null == token) {
      throw new IllegalStateException("Environment Variable TOKEN must be configured.");
    }

    this.client = new TwelveDataClient(this, this.nodeUri(), token);
    log.info("Connecting to twelvedata");
    this.client.connect();


    super.willStart();
  }

  @Override
  public void willStop() {
    this.executor.shutdownNow();
    super.willStop();
  }

  @SwimLane("subscribe")
  final CommandLane<Value> subscribe = this.<Value>commandLane()
      .onCommand(this::doSubscribe);

  private void doSubscribe(Item input) {
    String symbol = StreamSupport.stream(
            Spliterators.spliteratorUnknownSize(input.iterator(), Spliterator.ORDERED),
            false
        ).map(Item::stringValue)
        .collect(Collectors.joining(","));

    this.client.subscribe(symbol);
  }

  @SwimLane("messagesPerSecond")
  final ValueLane<Integer> messagesPerSecond = this.valueLane();

  TimerRef requestPerSecondTimer = this.setTimer(1000, this::calculateRequestsPerSecond);

  void calculateRequestsPerSecond() {
    int messages = this.client.getAndResetMessagesPerSecond();
    this.messagesPerSecond.set(messages);
    requestPerSecondTimer = this.setTimer(1000, this::calculateRequestsPerSecond);
  }


  @SwimLane("connectionOpen")
  final CommandLane<Value> connectionOpen = this.<Value>commandLane()
      .onCommand(input -> {
        Value symbols = getProp("symbols");
        final List<Item> items = new ArrayList<>();

        symbols.forEach(symbol -> {
          items.add(symbol);
          if (items.size() == 50) {
            Builder<Item, Value> builder = Value.builder();
            items.forEach(builder::add);
            this.doSubscribe(builder.bind());
            items.clear();
          }
        });

        if (!items.isEmpty()) {
          Builder<Item, Value> builder = Value.builder();
          items.forEach(builder::add);
          this.doSubscribe(builder.bind());
        }
      });

  @SwimLane("timeSeries")
  final CommandLane<Value> timeSeries = this.<Value>commandLane()
      .onCommand(input -> {
        this.executor.submit(() -> {
          this.client.timeSeries(input);
        });
      });

  @SwimLane("profile")
  final CommandLane<Value> profile = this.<Value>commandLane()
      .onCommand(input -> {
        this.client.profile(input);
      });


}
