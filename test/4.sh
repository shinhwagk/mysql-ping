source /workspace/bin/custom.sh

export MHA_REPLICAS=fr1,fr2,fr3
export MHA_REPLICA_LIVE_fr1=0
export MHA_REPLICA_LIVE_fr2=0
export MHA_REPLICA_LIVE_fr3=0
export MHA_REPLICA_STATUS_LOGFILE_fr1=mysql-bin.000001
export MHA_REPLICA_STATUS_LOGFILE_fr2=mysql-bin.000001
export MHA_REPLICA_STATUS_LOGFILE_fr3=mysql-bin.000002
export MHA_REPLICA_STATUS_LOGPOS_fr1=35737
export MHA_REPLICA_STATUS_LOGPOS_fr2=35717
export MHA_REPLICA_STATUS_LOGPOS_fr3=35717

if xxx=$(custom_elect_new_source_from_replicas); then
    echo $xxx
else
    echo error
fi
